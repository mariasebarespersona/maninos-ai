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
        """Get system prompt for MANINOS docs agent (generic PDF management)."""
        import os
        
        # Read the simplified MANINOS docs prompt
        prompts_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "prompts")
        base_prompt_path = os.path.join(prompts_dir, "agents", "docs_agent", "_base_maninos.md")
        
        try:
            with open(base_prompt_path, "r", encoding="utf-8") as f:
                return f.read()
        except FileNotFoundError:
            # Fallback to inline prompt if file doesn't exist
            return """You are a document management assistant for MANINOS AI (mobile home acquisitions).

Help users:
- Upload PDFs (Zillow, MHVillage, inspections, title docs)
- Extract data from PDFs using rag_qa_with_citations
- List documents (use list_docs)
- Delete documents (use delete_document)
- Send documents by email

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

