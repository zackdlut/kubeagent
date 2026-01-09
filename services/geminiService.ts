import { GoogleGenAI, Type } from "@google/genai";
import { AgentResponse, ClusterState } from "../types";

const SYSTEM_INSTRUCTION = `
You are KubeAgent, an expert Kubernetes SRE assistant.
Your task is to translate natural language user requests into a series of kubectl or bash commands.

RULES:
1. Always return valid JSON matching the schema provided.
2. If the user asks for logs, find the likely pod name from the provided cluster state.
3. For network debugging (like tcpdump), explain which pod/container you are targeting.
4. If a command requires multiple steps (e.g., finding a pod then exec-ing into it), list them in the 'steps' array.
5. Provide clear explanations for why each command is needed.

CLUSTER STATE CONTEXT:
`;

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    // Guidelines require using process.env.API_KEY directly.
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async processRequest(userInput: string, clusterState: ClusterState): Promise<AgentResponse> {
    const context = `
    Current namespaces: ${clusterState.namespaces.join(', ')}
    Pods: ${clusterState.pods.map(p => `${p.name} (ns: ${p.namespace}, ip: ${p.ip})`).join(', ')}
    `;

    const response = await this.ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: userInput,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION + context,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            steps: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  description: { type: Type.STRING },
                  command: { type: Type.STRING },
                  explanation: { type: Type.STRING }
                },
                required: ['description', 'command', 'explanation']
              }
            },
            intent: { 
              type: Type.STRING,
              enum: ['QUERY', 'ACTION', 'DEBUG']
            },
            summary: { type: Type.STRING }
          },
          required: ['steps', 'intent', 'summary']
        }
      }
    });

    try {
      const text = response.text || '{}';
      return JSON.parse(text) as AgentResponse;
    } catch (e) {
      console.error("Failed to parse AI response", e);
      return {
        steps: [{ description: "Error", command: "echo 'Parse Error'", explanation: "The AI returned an invalid response." }],
        intent: 'DEBUG',
        summary: "I encountered an error interpreting your request."
      };
    }
  }
}