"""
统一封装 LlamaIndex 模型提供方的选择逻辑。

目的：
- OpenAI 官方模型继续走 `llama_index.*.openai`
- DashScope embedding 走原生 DashScope 集成，避免 OpenAIEmbedding 的模型白名单报错
- DashScope / Qwen 文本模型走 OpenAI-compatible 原生 client，绕开当前 DashScope LlamaIndex 插件的 URL 问题
"""

from __future__ import annotations

from typing import Any, Optional
import os
import time

from requests.exceptions import ConnectionError as RequestsConnectionError
from requests.exceptions import SSLError as RequestsSSLError
from requests.exceptions import Timeout as RequestsTimeout


DASHSCOPE_BASE_URL_MARKERS = (
    "dashscope.aliyuncs.com",
    "dashscope-intl.aliyuncs.com",
)


def _normalized(value: str | None) -> str:
    return (value or "").strip().lower()


try:
    from openai import OpenAI as OpenAIClient
    from llama_index.core.base.embeddings.base import BaseEmbedding
    from llama_index.core.bridge.pydantic import PrivateAttr
    from llama_index.core.base.llms.types import (
        CompletionResponse,
        CompletionResponseGen,
        LLMMetadata,
    )
    from llama_index.core.callbacks import CallbackManager
    from llama_index.core.llms.custom import CustomLLM
    from llama_index.core.types import PydanticProgramMode
except ImportError:
    OpenAIClient = None
    BaseEmbedding = object
    CompletionResponse = None
    CompletionResponseGen = None
    LLMMetadata = None
    CallbackManager = None
    CustomLLM = object
    PydanticProgramMode = None


if OpenAIClient is not None and CompletionResponse is not None and LLMMetadata is not None:

    class OpenAICompatibleLLM(CustomLLM):
        """使用 OpenAI 兼容接口的轻量 LlamaIndex LLM 封装。"""

        model_name: str = ""
        api_key: str = ""
        api_base: Optional[str] = None
        max_tokens: Optional[int] = 1024
        temperature: float = 0.1
        additional_request_kwargs: dict[str, Any] = {}
        _client: Any = PrivateAttr()

        def __init__(
            self,
            model_name: str,
            api_key: str,
            api_base: Optional[str] = None,
            max_tokens: Optional[int] = 1024,
            temperature: float = 0.1,
            additional_request_kwargs: Optional[dict[str, Any]] = None,
            callback_manager: Optional[CallbackManager] = None,
            system_prompt: Optional[str] = None,
        ) -> None:
            super().__init__(
                model_name=model_name,
                api_key=api_key,
                api_base=api_base,
                max_tokens=max_tokens,
                temperature=temperature,
                additional_request_kwargs=dict(additional_request_kwargs or {}),
                callback_manager=callback_manager or CallbackManager([]),
                system_prompt=system_prompt,
                pydantic_program_mode=PydanticProgramMode.DEFAULT,
            )
            self.model_name = model_name
            self.api_key = api_key
            self.api_base = api_base
            self.max_tokens = max_tokens
            self.temperature = temperature
            self.additional_request_kwargs = dict(additional_request_kwargs or {})
            self._client = OpenAIClient(api_key=api_key, base_url=api_base)

        @classmethod
        def class_name(cls) -> str:
            return "OpenAICompatibleLLM"

        @property
        def metadata(self) -> LLMMetadata:
            return LLMMetadata(
                context_window=131072,
                num_output=self.max_tokens or -1,
                is_chat_model=False,
                model_name=self.model_name,
            )

        def complete(
            self, prompt: str, formatted: bool = False, **kwargs: Any
        ) -> CompletionResponse:
            messages = []
            if getattr(self, "system_prompt", None):
                messages.append({"role": "system", "content": self.system_prompt})
            messages.append({"role": "user", "content": prompt})

            request_kwargs = {
                "model": self.model_name,
                "messages": messages,
                "temperature": kwargs.get("temperature", self.temperature),
            }
            max_tokens = kwargs.get("max_tokens", self.max_tokens)
            if max_tokens is not None:
                request_kwargs["max_tokens"] = max_tokens
            request_kwargs.update(self.additional_request_kwargs)

            response = self._client.chat.completions.create(**request_kwargs)
            text = response.choices[0].message.content or ""
            return CompletionResponse(text=text, raw=response)

        def stream_complete(
            self, prompt: str, formatted: bool = False, **kwargs: Any
        ) -> CompletionResponseGen:
            messages = []
            if getattr(self, "system_prompt", None):
                messages.append({"role": "system", "content": self.system_prompt})
            messages.append({"role": "user", "content": prompt})

            request_kwargs = {
                "model": self.model_name,
                "messages": messages,
                "temperature": kwargs.get("temperature", self.temperature),
                "stream": True,
            }
            max_tokens = kwargs.get("max_tokens", self.max_tokens)
            if max_tokens is not None:
                request_kwargs["max_tokens"] = max_tokens
            request_kwargs.update(self.additional_request_kwargs)

            stream = self._client.chat.completions.create(**request_kwargs)

            def gen() -> CompletionResponseGen:
                for chunk in stream:
                    delta = chunk.choices[0].delta
                    delta_text = getattr(delta, "content", None) or ""
                    reasoning_text = getattr(delta, "reasoning_content", None) or ""
                    if not delta_text and not reasoning_text:
                        continue
                    additional_kwargs: dict[str, Any] = {}
                    if reasoning_text:
                        additional_kwargs["reasoning_delta"] = reasoning_text
                    yield CompletionResponse(
                        text=delta_text or "",
                        delta=delta_text or None,
                        raw=chunk,
                        additional_kwargs=additional_kwargs,
                    )

            return gen()

else:

    class OpenAICompatibleLLM:  # type: ignore[no-redef]
        """在未安装 LlamaIndex 的环境中保留可测试的占位类。"""

        def __init__(
            self,
            model_name: str,
            api_key: str,
            api_base: Optional[str] = None,
            max_tokens: Optional[int] = 1024,
            temperature: float = 0.1,
            additional_request_kwargs: Optional[dict[str, Any]] = None,
            callback_manager: Any = None,
            system_prompt: Optional[str] = None,
        ) -> None:
            self.model_name = model_name
            self.api_key = api_key
            self.api_base = api_base
            self.max_tokens = max_tokens
            self.temperature = temperature
            self.additional_request_kwargs = dict(additional_request_kwargs or {})
            self.callback_manager = callback_manager
            self.system_prompt = system_prompt


RETRYABLE_EMBEDDING_ERROR_MARKERS = (
    "unexpected_eof_while_reading",
    "max retries exceeded",
    "connection reset by peer",
    "temporarily unavailable",
    "connection aborted",
    "read timed out",
)


def _is_retryable_embedding_error(exc: Exception) -> bool:
    if isinstance(exc, (RequestsSSLError, RequestsConnectionError, RequestsTimeout, ConnectionResetError, TimeoutError)):
        return True

    message = str(exc).strip().lower()
    return any(marker in message for marker in RETRYABLE_EMBEDDING_ERROR_MARKERS)


class RetryingEmbedding(BaseEmbedding):
    """为远程 embedding 请求补充轻量重试，吸收瞬时网络/TLS 抖动。"""

    model_name: str = ""
    embed_batch_size: int = 10
    max_retries: int = 2
    retry_delay_seconds: float = 0.6
    _delegate: Any = PrivateAttr()

    def __init__(
        self,
        delegate: Any,
        *,
        max_retries: int = 2,
        retry_delay_seconds: float = 0.6,
    ) -> None:
        super().__init__(
            model_name=getattr(delegate, "model_name", ""),
            embed_batch_size=int(getattr(delegate, "embed_batch_size", 10) or 10),
            callback_manager=getattr(delegate, "callback_manager", None),
            num_workers=getattr(delegate, "num_workers", None),
            embeddings_cache=getattr(delegate, "embeddings_cache", None),
            rate_limiter=getattr(delegate, "rate_limiter", None),
            max_retries=max_retries,
            retry_delay_seconds=retry_delay_seconds,
        )
        self._delegate = delegate

    @classmethod
    def class_name(cls) -> str:
        return "RetryingEmbedding"

    def _run_with_retry(self, func: Any, *args: Any, **kwargs: Any) -> Any:
        last_error: Exception | None = None
        for attempt in range(self.max_retries + 1):
            try:
                return func(*args, **kwargs)
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                if attempt >= self.max_retries or not _is_retryable_embedding_error(exc):
                    raise
                time.sleep(self.retry_delay_seconds * (attempt + 1))

        raise last_error or RuntimeError("embedding request failed")

    def _get_query_embedding(self, query: str) -> Any:
        return self._run_with_retry(self._delegate._get_query_embedding, query)

    def _get_text_embedding(self, text: str) -> Any:
        return self._run_with_retry(self._delegate._get_text_embedding, text)

    def _get_text_embeddings(self, texts: list[str]) -> Any:
        return self._run_with_retry(self._delegate._get_text_embeddings, texts)

    async def _aget_query_embedding(self, query: str) -> Any:
        if hasattr(self._delegate, "_aget_query_embedding"):
            return await self._delegate._aget_query_embedding(query)
        return self._run_with_retry(self._delegate._get_query_embedding, query)


def should_use_dashscope_embedding(model_name: str, api_base: str | None = None) -> bool:
    normalized_model = _normalized(model_name)
    normalized_base = _normalized(api_base)
    return (
        any(marker in normalized_base for marker in DASHSCOPE_BASE_URL_MARKERS)
        or normalized_model.startswith("text-embedding-v")
        or normalized_model.startswith("tongyi-embedding-")
        or normalized_model.startswith("qwen")
    )


def should_use_dashscope_llm(model_name: str, api_base: str | None = None) -> bool:
    normalized_model = _normalized(model_name)
    normalized_base = _normalized(api_base)
    return any(marker in normalized_base for marker in DASHSCOPE_BASE_URL_MARKERS) or (
        normalized_model.startswith("qwen")
        or normalized_model.startswith("qwq")
    )


def create_embedding_model(model_name: str, api_key: str, api_base: str | None = None):
    retry_count_raw = os.getenv("EMBEDDING_RETRY_COUNT", "2")
    retry_delay_raw = os.getenv("EMBEDDING_RETRY_DELAY_SECONDS", "0.6")
    try:
        retry_count = max(0, int(retry_count_raw))
    except ValueError:
        retry_count = 2
    try:
        retry_delay_seconds = max(0.0, float(retry_delay_raw))
    except ValueError:
        retry_delay_seconds = 0.6

    if should_use_dashscope_embedding(model_name=model_name, api_base=api_base):
        try:
            from llama_index.embeddings.dashscope import DashScopeEmbedding
        except ImportError as exc:
            raise ImportError(
                "当前配置检测到 DashScope embedding，请先安装依赖："
                "`pip install llama-index-embeddings-dashscope dashscope`"
            ) from exc

        raw_batch_size = os.getenv("DASHSCOPE_EMBED_BATCH_SIZE", "10")
        try:
            embed_batch_size = max(1, min(int(raw_batch_size), 10))
        except ValueError:
            embed_batch_size = 10

        embedding = DashScopeEmbedding(
            model_name=model_name,
            api_key=api_key,
            embed_batch_size=embed_batch_size,
        )
        return RetryingEmbedding(
            delegate=embedding,
            max_retries=retry_count,
            retry_delay_seconds=retry_delay_seconds,
        )

    from llama_index.embeddings.openai import OpenAIEmbedding

    embedding = OpenAIEmbedding(
        model=model_name,
        api_key=api_key,
        api_base=api_base,
    )
    return RetryingEmbedding(
        delegate=embedding,
        max_retries=retry_count,
        retry_delay_seconds=retry_delay_seconds,
    )


def create_text_llm(
    model_name: str,
    api_key: str,
    api_base: str | None = None,
    *,
    disable_thinking: bool = False,
):
    if should_use_dashscope_llm(model_name=model_name, api_base=api_base):
        additional_request_kwargs: dict[str, Any] = {}
        if disable_thinking:
            additional_request_kwargs["extra_body"] = {"enable_thinking": False}
        return OpenAICompatibleLLM(
            model_name=model_name,
            api_key=api_key,
            api_base=api_base,
            additional_request_kwargs=additional_request_kwargs,
        )

    from llama_index.llms.openai import OpenAI

    return OpenAI(
        model=model_name,
        api_key=api_key,
        api_base=api_base,
    )
