"""
Chinese-friendly FTS helpers.

We store jieba-tokenized text in `*_tokens` columns and generate
`tsvector('simple', tokens)` so that Postgres treats every token as
an atomic lexeme. At query time we apply the same tokenization to the
question and build a `tsquery` from the tokens.

This avoids needing the zhparser or pg_jieba Postgres extensions —
everything Chinese-aware happens in Python.
"""

from __future__ import annotations

import re

import jieba

# Stopwords mirror llm-rag's storage._prepare_fts_query() so search recall
# parity is roughly preserved across the two systems.
_STOPWORDS: set[str] = {
    "的", "了", "和", "与", "及", "或", "是", "在", "有", "为", "对",
    "我", "你", "他", "她", "它", "请", "怎么", "如何", "什么", "哪里",
    "the", "a", "an", "and", "or", "is", "are", "to", "of", "in", "on", "for",
}


# Punctuation / whitespace splitter for ASCII fallback
_SPLIT_RE = re.compile(r"[\s\W_]+", re.UNICODE)


def tokenize_for_index(text: str) -> str:
    """Tokenize for write-side: returns whitespace-joined tokens.

    Empty strings produce '' (caller may treat as no-FTS).
    """
    if not text:
        return ""
    tokens: list[str] = []
    for tok in jieba.cut_for_search(text):
        tok = tok.strip()
        if not tok:
            continue
        if len(tok) == 1 and not tok.isalnum() and not _is_cjk(tok):
            continue
        tokens.append(tok)
    return " ".join(tokens)


def tokenize_for_query(text: str) -> list[str]:
    """Tokenize for read-side: returns a deduped list of meaningful tokens."""
    if not text:
        return []
    seen: set[str] = set()
    out: list[str] = []
    for tok in jieba.cut_for_search(text):
        tok = tok.strip().lower()
        if not tok or tok in _STOPWORDS:
            continue
        if len(tok) == 1 and not _is_cjk(tok) and not tok.isalnum():
            continue
        if tok in seen:
            continue
        seen.add(tok)
        out.append(tok)
    if not out:
        # Fallback: split by non-word chars so that pure-ASCII queries still
        # produce something usable.
        for tok in _SPLIT_RE.split(text):
            tok = tok.strip().lower()
            if tok and tok not in seen:
                seen.add(tok)
                out.append(tok)
    return out


def build_tsquery(tokens: list[str], operator: str = "|") -> str:
    """Build a Postgres tsquery literal from tokens.

    operator:
      '&' — all tokens must match (AND)
      '|' — any token matches (OR, default; better recall for short queries)
    """
    if not tokens:
        return ""
    escaped = [_escape_tsquery_token(tok) for tok in tokens if tok]
    return f" {operator} ".join(escaped)


def _escape_tsquery_token(tok: str) -> str:
    # Wrap in single quotes for tsquery, escape internal quotes.
    safe = tok.replace("'", "''")
    return f"'{safe}'"


def _is_cjk(ch: str) -> bool:
    return any("一" <= c <= "鿿" for c in ch)
