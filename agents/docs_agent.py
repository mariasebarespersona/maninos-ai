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

from typing import List, Dict, Any
import logging
from .base_agent import BaseAgent
from tools.registry import (
    upload_and_link_tool,
    send_email_tool,
    list_docs_tool,
    signed_url_for_tool,
    qa_document_tool,
    rag_qa_with_citations_tool,
    summarize_document_tool,
    delete_document_tool,
    update_property_fields_tool  # Added for updating acquisition_stage
    # Removed RAMA-specific tools: list_related_facturas_tool, qa_payment_schedule_tool
)
from tools.docs_tools import list_docs as _list_docs
from tools.property_tools import update_property_fields as _update_property_fields, get_property as _get_property

logger = logging.getLogger(__name__)


class DocsAgent(BaseAgent):
    """Agent specialized in document management operations."""
    
    def __init__(self):
        # TEMPORARY: Using gpt-4o-mini to avoid rate limiting (30K TPM exceeded)
        # Can revert to gpt-4o once OpenAI account is upgraded to higher tier
        super().__init__(name="DocsAgent", model="gpt-4o-mini", temperature=0.5)
    
    # No override needed - BaseAgent.run() with ReAct loop handles everything
    def get_system_prompt(self, intent: str = None, property_name: str = None, numbers_template: str = None) -> str:
        """
        Get system prompt using modular prompt loader (same as PropertyAgent).
        
        Note: property_name and numbers_template are accepted for compatibility with BaseAgent
        but are not used by DocsAgent.
        """
        import sys
        import os
        
        # Add prompts directory to path
        prompts_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "prompts")
        if prompts_dir not in sys.path:
            sys.path.insert(0, prompts_dir)
        
        from prompt_loader import build_agent_prompt
        
        # Build modular prompt (base + intent-specific modules)
        # DocsAgent doesn't use property_name or numbers_template
        return build_agent_prompt(
            agent_name="docs_agent",
            intent=intent
        )
    
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
            update_property_fields_tool,  # Update acquisition_stage when documents are complete
            # Removed RAMA-specific tools (facturas, payment schedules)
        ]
    
    def run(self, user_input: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Override run() to add post-processing for Paso 0 completion.
        
        After the agent responds, automatically check if documents are complete
        and update acquisition_stage if needed.
        """
        # Call parent run() to execute the agent's ReAct loop
        result = super().run(user_input, context)
        
        # POST-PROCESSING: Auto-update acquisition_stage if Paso 0 is complete
        property_id = context.get("property_id")
        if property_id:
            try:
                # Check current acquisition_stage
                property_data = _get_property(property_id)
                if property_data and property_data.get("acquisition_stage") == "documents_pending":
                    # Check if all 3 document types are present
                    docs = _list_docs(property_id)
                    doc_types = set(d.get("document_type") for d in docs if d.get("document_type"))
                    required_types = {"title_status", "property_listing", "property_photos"}
                    
                    if required_types.issubset(doc_types):
                        # All 3 types present → update stage to 'initial'
                        logger.info(f"[DocsAgent] 🎯 AUTO-UPDATE: All 3 document types present → Updating stage to 'initial'")
                        _update_property_fields(property_id, {"acquisition_stage": "initial"})
                        logger.info(f"[DocsAgent] ✅ Stage updated successfully")
                    else:
                        missing = required_types - doc_types
                        logger.info(f"[DocsAgent] ⏳ Documents incomplete. Missing types: {missing}")
            except Exception as e:
                logger.error(f"[DocsAgent] ❌ Error in post-processing: {e}")
        
        return result

