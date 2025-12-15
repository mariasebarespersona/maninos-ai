"""
CLEAN VERSION - Section to replace in orchestrator.py (lines 162-343)

This removes all keyword-based routing and trusts the flow_validator + agent LLMs.
"""

# START REPLACEMENT (line 162)
            else:
                # ============================================================
                # INTELLIGENT ROUTING: Let the system reason, not match keywords
                # ============================================================
                
                # Strategy:
                # 1. If we have flow_validation (property exists) → use it
                # 2. Otherwise → use active_router for general routing
                # 3. Let the agent's LLM do the actual reasoning with enriched context
                
                routing = None
                
                # === PATH 1: FLOW-BASED ROUTING (when property exists) ===
                if full_context.get("flow_validation") and property_id:
                    flow_validation = full_context["flow_validation"]
                    user_intent_analysis = full_context.get("user_intent_analysis", {})
                    recommended_agent = flow_validation.get("recommended_agent", "PropertyAgent")
                    
                    # Simple, intelligent routing based on flow analysis
                    routing = {
                        "intent": user_intent_analysis.get("intent", "general_conversation"),
                        "confidence": user_intent_analysis.get("confidence", 0.80),
                        "target_agent": recommended_agent,
                        "method": "flow_validator",
                        "reason": user_intent_analysis.get("reason", "Flow-based routing")
                    }
                    
                    logger.info(
                        f"[orchestrator] 🧭 Flow-based routing → {recommended_agent} "
                        f"(stage={full_context.get('acquisition_stage')}, "
                        f"intent={routing['intent']})"
                    )
                
                # === PATH 2: ACTIVE ROUTER (no property or no flow validation) ===
                else:
                    routing = await self.active_router.decide(current_input, full_context)
                    logger.info(
                        f"[orchestrator] 🔍 Active router → {routing['target_agent']} "
                        f"(intent={routing['intent']}, conf={routing['confidence']:.2f})"
                    )
                
                # Set agent from routing decision
                current_agent_name = routing["target_agent"]
                agent_path.append(current_agent_name)
# END REPLACEMENT (line 343)

