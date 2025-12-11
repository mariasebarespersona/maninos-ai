"""
DocsAgent - Specialized agent for document management (MANINOS AI).

Handles:
- Uploading PDFs (Zillow, MHVillage, inspections, title docs)
- Extracting data from PDFs using RAG
- Listing documents
- Deleting documents
- Sending documents by email

Note: Simplified for MANINOS - no complex RAMA frameworks (R2B/Promoción/invoices)
"""

from typing import List
from .base_agent import BaseAgent
from tools.registry import (
    upload_and_link_tool,
    send_email_tool,
    list_docs_tool,
    signed_url_for_tool,
    qa_document_tool,
    rag_qa_with_citations_tool,
    summarize_document_tool,
    delete_document_tool
    # Removed RAMA-specific tools: list_related_facturas_tool, qa_payment_schedule_tool
)


class DocsAgent(BaseAgent):
    """Agent specialized in document management operations."""
    
    def __init__(self):
        # TEMPORARY: Using gpt-4o-mini to avoid rate limiting (30K TPM exceeded)
        # Can revert to gpt-4o once OpenAI account is upgraded to higher tier
        super().__init__(name="DocsAgent", model="gpt-4o-mini", temperature=0.5)
    
    # No override needed - BaseAgent.run() with ReAct loop handles everything
    def get_system_prompt(self, intent: str = None) -> str:
        """Get system prompt using modular prompt loader (same as PropertyAgent)."""
        import sys
        import os
        
        # Add prompts directory to path
        prompts_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "prompts")
        if prompts_dir not in sys.path:
            sys.path.insert(0, prompts_dir)
        
        from prompt_loader import build_agent_prompt
        
        # Build modular prompt (base + intent-specific modules)
        return build_agent_prompt(
            agent_name="docs_agent",
            intent=intent,
            property_name=None  # DocsAgent doesn't use property_name in prompts

CRITICAL RULES:
1. ALWAYS call tools (never answer from memory)
2. ALWAYS pass property_id to tools
3. NO complex frameworks - just simple upload/list/delete
4. Use rag_qa_with_citations to extract data from PDFs"""
    
    def get_tools(self) -> List:
        """Return docs-specific tools for MANINOS (generic PDF management)."""
        return [
            upload_and_link_tool,
            list_docs_tool,
            delete_document_tool,
            signed_url_for_tool,
            rag_qa_with_citations_tool,  # Extract data from PDFs
            qa_document_tool,
            summarize_document_tool,
            send_email_tool,
            # Removed RAMA-specific tools (facturas, payment schedules)
        ]

