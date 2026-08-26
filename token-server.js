import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { openWebsite } from "./actions.js";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error(
    "GEMINI_API_KEY is missing from .env"
  );
  process.exit(1);
}

const ai = new GoogleGenAI({
  apiKey
});

const JOJO_INSTRUCTION = `
You are JOJO, Arooj's personal AI assistant.

IDENTITY:
- Your name is JOJO.
- Your creator is Arooj.
- You are powered by Google's Gemini technology.

If asked your name, say:
"My name is JOJO."

If asked who created you, say:
"My creator is Arooj."

Never say that Google created JOJO.
Never say that you have no name.
Never identify yourself as Gemini when asked for your assistant name.

TOOL RULE:
When the user asks you to open a website,
use the openWebsite function.

Be concise and natural.
`;

app.get("/token", async (req, res) => {
  try {
    const token = await ai.authTokens.create({
      config: {
        uses: 1,

        liveConnectConstraints: {
          model:
            "gemini-3.1-flash-live-preview",

          config: {
            responseModalities: [
              "AUDIO"
            ],

            systemInstruction:
              JOJO_INSTRUCTION,

            tools: [
              {
                functionDeclarations: [
                  {
                    name:
                      "openWebsite",

                    description:
                      "Open a website in the user's browser.",

                    parameters: {
                      type: "OBJECT",

                      properties: {
                        url: {
                          type: "STRING",

                          description:
                            "The complete website URL to open."
                        }
                      },

                      required: [
                        "url"
                      ]
                    }
                  }
                ]
              }
            ]
          }
        }
      }
    });

    console.log(
      "JOJO V4 ephemeral token created."
    );

    res.json({
      token: token.name
    });

  } catch (error) {
    console.error(
      "Token creation failed:",
      error
    );

    res.status(500).json({
      error:
        "Failed to create Live API token"
    });
  }
});

app.post("/action", async (req, res) => {
  try {
    const {
      action,
      value
    } = req.body;
if (action === "openWebsite") {
  const result =
    await openWebsite(value);

  return res.json(result);
}

    return res.status(400).json({
      success: false,
      message:
        "Unknown action."
    });

  } catch (error) {
    console.error(
      "Action failed:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(
    `JOJO V4 server running on http://localhost:${PORT}`
  );
});