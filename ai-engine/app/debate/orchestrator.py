import asyncio
import json
from typing import AsyncGenerator
from app.core.llm_manager import LLMManager


ADVOCATE_SYSTEM = (
    "You are The Advocate — a persuasive, optimistic analyst. "
    "Using ONLY the document evidence provided below, build the strongest possible case IN FAVOR "
    "of the user's proposition. Be thorough, cite specific details from the document, and be convincing. "
    "Keep your argument to 3-5 paragraphs."
)

CRITIC_SYSTEM = (
    "You are The Critic — a skeptical, sharp analyst. "
    "Using ONLY the document evidence provided below, build the strongest possible case AGAINST "
    "the user's proposition. Find weaknesses, risks, missing information, and counterarguments. "
    "Be thorough and intellectually honest. Keep your argument to 3-5 paragraphs."
)

JUDGE_SYSTEM = (
    "You are The Judge — a fair, senior analyst delivering a final verdict. "
    "You have read both The Advocate's argument (in favor) and The Critic's argument (against). "
    "Weigh both sides carefully, acknowledge the strongest points from each, and deliver a balanced, "
    "well-reasoned FINAL VERDICT. Be authoritative and conclusive. Keep to 2-4 paragraphs."
)


async def _run_agent(system_prompt: str, context: str, question: str, history: str) -> str:
    """Run one debate agent to completion and return its full response."""
    prompt = (
        f"{system_prompt}\n\n"
        f"{history}"
        f"[DOCUMENT CONTEXT]\n{context}\n\n"
        f"User Question: {question}\n\n"
        "Your argument:"
    )
    llm = LLMManager.get_llm()
    result = await llm.ainvoke(prompt)
    return result.content if hasattr(result, 'content') else str(result)


async def run_debate(context: str, question: str, history: str) -> AsyncGenerator[str, None]:
    """
    Multi-Agent Debate Orchestrator.
    
    Runs Advocate and Critic concurrently, then feeds both arguments
    to the Judge for a final streaming verdict.
    
    Yields SSE-formatted strings.
    """
    # Phase 1: Run Advocate and Critic concurrently
    advocate_task = asyncio.create_task(
        _run_agent(ADVOCATE_SYSTEM, context, question, history)
    )
    critic_task = asyncio.create_task(
        _run_agent(CRITIC_SYSTEM, context, question, history)
    )

    # Stream a status event
    yield f"data: {json.dumps({'type': 'debate_status', 'data': 'The Advocate and The Critic are analyzing the document...'})}\n\n"

    advocate_result, critic_result = await asyncio.gather(advocate_task, critic_task)

    # Stream both arguments at once
    yield f"data: {json.dumps({'type': 'debate_advocate', 'data': advocate_result})}\n\n"
    yield f"data: {json.dumps({'type': 'debate_critic', 'data': critic_result})}\n\n"

    # Phase 2: The Judge streams its verdict
    judge_prompt = (
        f"{JUDGE_SYSTEM}\n\n"
        f"{history}"
        f"[DOCUMENT CONTEXT]\n{context}\n\n"
        f"User Question: {question}\n\n"
        f"[THE ADVOCATE'S ARGUMENT]\n{advocate_result}\n\n"
        f"[THE CRITIC'S ARGUMENT]\n{critic_result}\n\n"
        "Your final verdict:"
    )

    llm = LLMManager.get_llm()
    async for chunk in llm.astream(judge_prompt):
        content = chunk.content if hasattr(chunk, 'content') else str(chunk)
        if content:
            yield f"data: {json.dumps({'type': 'debate_verdict', 'data': content})}\n\n"

    yield f"data: {json.dumps({'type': 'done'})}\n\n"
