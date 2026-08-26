import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { openWebsite } from "./actions.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const __filename =
  fileURLToPath(import.meta.url);

const __dirname =
  path.dirname(__filename);

const MEMORY_FILE =
  path.join(
    __dirname,
    "memory.json"
  );

const apiKey =
  process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error(
    "GEMINI_API_KEY is missing from .env"
  );

  process.exit(1);
}

const ai =
  new GoogleGenAI({
    apiKey
  });

/*
  MEMORY HELPERS
*/

function loadMemory() {
  try {
    if (
      !fs.existsSync(
        MEMORY_FILE
      )
    ) {
      return {};
    }

    const raw =
      fs.readFileSync(
        MEMORY_FILE,
        "utf8"
      );

    if (
      !raw.trim()
    ) {
      return {};
    }

    const memory =
      JSON.parse(raw);

    if (
      memory &&
      typeof memory ===
        "object" &&
      !Array.isArray(memory)
    ) {
      return memory;
    }

    return {};

  } catch (error) {
    console.error(
      "Memory read failed:",
      error
    );

    return {};
  }
}

function saveMemory(
  memory
) {
  fs.writeFileSync(
    MEMORY_FILE,
    JSON.stringify(
      memory,
      null,
      2
    ),
    "utf8"
  );
}

/*
  CLEAN MEMORY VALUE
*/

function cleanMemoryValue(
  value
) {
  return String(value)
    .trim()
    .replace(
      /[.!?]+$/,
      ""
    )
    .trim();
}

/*
  BUILD JOJO INSTRUCTION
  WITH SAVED MEMORY
*/

function buildJojoInstruction() {
  const memory =
    loadMemory();

  const memoryEntries =
    Object.entries(
      memory
    );

  let memoryText =
    "No saved memories yet.";

  if (
    memoryEntries.length >
    0
  ) {
    memoryText =
      memoryEntries
        .map(
          ([key, value]) =>
            `- ${key}: ${value}`
        )
        .join("\n");
  }

  return `
You are JOJO, Arooj's personal AI assistant.

IDENTITY:

- Your name is JOJO.
- Your creator is Arooj.
- You are powered by Google's Gemini technology.

If asked your name, say:
"My name is JOJO."

If asked who created you, say:
"My creator is Arooj."

If asked who your creator is, say:
"My creator is Arooj."

If asked whether you are Gemini or JOJO, say:
"I am JOJO, Arooj's personal AI assistant. I am powered by Google's Gemini technology."

Never say that Google created JOJO.
Never say that you have no name.
Never identify yourself as Gemini when asked for your assistant name.

MEMORY:

The following information has been explicitly saved by the user:

${memoryText}

IMPORTANT MEMORY RULES:

- Use saved memories when they are relevant.
- If the user asks about a saved memory, answer using the saved value.
- If the user asks "What do you remember about me?", summarize the saved memories.
- If the user asks "What do you remember?", summarize the saved memories.
- If the user asks about a memory that is not listed, say that you do not have that information saved.
- Never invent a memory.
- Never claim a memory was forgotten unless it has actually been deleted.
- Treat the saved memory list above as persistent memory.

ACTION RULE:

When the user asks you to open a website,
use the openWebsite function.

After the website tool succeeds,
briefly tell the user that the website was opened.

Be concise and natural.
Speak clearly.
`;

}

/*
  LIVE API TOKEN
*/

app.get(
  "/token",
  async (
    req,
    res
  ) => {
    try {
      const jojoInstruction =
        buildJojoInstruction();

      console.log(
        "JOJO memory loaded:",
        loadMemory()
      );

      const token =
        await ai.authTokens.create({
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
                  jojoInstruction,

                tools: [
                  {
                    functionDeclarations: [
                      {
                        name:
                          "openWebsite",

                        description:
                          "Open a website in the user's browser.",

                        parameters: {
                          type:
                            "OBJECT",

                          properties: {
                            url: {
                              type:
                                "STRING",

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

      return res.json({
        token:
          token.name
      });

    } catch (error) {
      console.error(
        "Token creation failed:",
        error
      );

      return res.status(
        500
      ).json({
        error:
          "Failed to create Live API token"
      });
    }
  }
);

/*
  WEBSITE ACTION
*/

app.post(
  "/action",
  async (
    req,
    res
  ) => {
    try {
      const {
        action,
        value
      } = req.body;

      if (
        action ===
        "openWebsite"
      ) {
        const result =
          await openWebsite(
            value
          );

        return res.json(
          result
        );
      }

      return res.status(
        400
      ).json({
        success: false,
        message:
          "Unknown action."
      });

    } catch (error) {
      console.error(
        "Action failed:",
        error
      );

      return res.status(
        500
      ).json({
        success: false,
        message:
          error.message
      });
    }
  }
);

/*
  SAVE MEMORY
*/

app.post(
  "/memory",
  (
    req,
    res
  ) => {
    try {
      const {
        key,
        value
      } = req.body;

      if (
        !key ||
        value === undefined ||
        value === null
      ) {
        return res.status(
          400
        ).json({
          success: false,
          message:
            "Memory key and value are required."
        });
      }

      const cleanKey =
        String(key)
          .trim()
          .toLowerCase()
          .replace(
            /\s+/g,
            "_"
          );

      const cleanValue =
        cleanMemoryValue(
          value
        );

      if (
        !cleanKey ||
        !cleanValue
      ) {
        return res.status(
          400
        ).json({
          success: false,
          message:
            "Memory key and value cannot be empty."
        });
      }

      const memory =
        loadMemory();

      memory[cleanKey] =
        cleanValue;

      saveMemory(
        memory
      );

      console.log(
        "JOJO memory saved:",
        cleanKey,
        "=",
        cleanValue
      );

      return res.json({
        success: true,
        key:
          cleanKey,
        value:
          cleanValue
      });

    } catch (error) {
      console.error(
        "Memory save failed:",
        error
      );

      return res.status(
        500
      ).json({
        success: false,
        message:
          "Failed to save memory."
      });
    }
  }
);

/*
  READ ALL MEMORY
*/

app.get(
  "/memory",
  (
    req,
    res
  ) => {
    try {
      const memory =
        loadMemory();

      return res.json({
        success: true,
        memory:
          memory
      });

    } catch (error) {
      console.error(
        "Memory retrieval failed:",
        error
      );

      return res.status(
        500
      ).json({
        success: false,
        message:
          "Failed to retrieve memory."
      });
    }
  }
);

/*
  DELETE ONE MEMORY
*/

app.delete(
  "/memory/:key",
  (
    req,
    res
  ) => {
    try {
      const key =
        String(
          req.params.key
        )
          .trim()
          .toLowerCase()
          .replace(
            /\s+/g,
            "_"
          );

      if (!key) {
        return res.status(
          400
        ).json({
          success: false,
          message:
            "Memory key is required."
        });
      }

      const memory =
        loadMemory();

      if (
        !Object.prototype.hasOwnProperty.call(
          memory,
          key
        )
      ) {
        return res.status(
          404
        ).json({
          success: false,
          message:
            "Memory not found."
        });
      }

      const oldValue =
        memory[key];

      delete memory[key];

      saveMemory(
        memory
      );

      console.log(
        "JOJO memory deleted:",
        key,
        "=",
        oldValue
      );

      return res.json({
        success: true,
        key:
          key,
        value:
          oldValue
      });

    } catch (error) {
      console.error(
        "Memory delete failed:",
        error
      );

      return res.status(
        500
      ).json({
        success: false,
        message:
          "Failed to delete memory."
      });
    }
  }
);
/*
  DELETE MEMORY
*/

app.delete(
  "/memory/:key",
  (req, res) => {
    try {
      const key =
        req.params.key;

      if (!key) {
        return res.status(400).json({
          success: false,
          message:
            "Memory key is required."
        });
      }

      const memory =
        loadMemory();

      if (
        !Object.prototype.hasOwnProperty.call(
          memory,
          key
        )
      ) {
        console.log(
          "JOJO memory not found:",
          key
        );

        return res.json({
          success: false,
          message:
            "Memory not found."
        });
      }

      delete memory[key];

      saveMemory(
        memory
      );

      console.log(
        "JOJO memory deleted:",
        key
      );

      return res.json({
        success: true,
        key: key
      });

    } catch (error) {
      console.error(
        "Memory delete failed:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to delete memory."
      });
    }
  }
);

/*
  START SERVER
*/

app.listen(
  PORT,
  () => {
    console.log(
      `JOJO V4 server running on http://localhost:${PORT}`
    );
  }
);