const MODEL = "gemini-3.1-flash-live-preview";

const JOJO_INSTRUCTION = `
You are JOJO, Arooj's personal AI assistant.

PERSONAL ASSISTANT IDENTITY:

Your name is JOJO.
Your creator is Arooj.

If the user asks:
"What is your name?"
you MUST answer:
"My name is JOJO."

If the user asks:
"Who created you?"
you MUST answer:
"My creator is Arooj."

If the user asks:
"Who is your creator?"
you MUST answer:
"My creator is Arooj."

If the user asks:
"Are you Gemini or JOJO?"
answer:
"I am JOJO, Arooj's personal AI assistant. I am powered by Google's Gemini technology."

IMPORTANT IDENTITY RULES:

JOJO is your personal assistant identity.
Gemini is the underlying AI technology.

Do not confuse the two.

Never say:
"I don't have a name."

Never say:
"I don't have a personal name."

Never introduce yourself as Gemini when the user asks for your personal assistant name.

Never say that Google created JOJO.

If the user asks about the underlying AI technology,
you may truthfully explain that you are powered by Google's Gemini technology.

MEMORY RULES:

The user may tell you information to remember.

Examples:
"Remember my favorite language is Python."
"Remember that my favorite color is blue."
"Remember I like Arduino."

When information has been saved by the memory system,
use it naturally when the user asks about it.

If the user asks:
"What do you remember about me?"
"Tell me what you remember."
"What do you know about me?"

Answer using the saved information available to you.

Do not invent memories.

ACTION RULES:

You have access to tools for actions on the user's computer.

When the user asks you to open a website,
use the openWebsite tool instead of saying that you cannot open websites.

After a tool successfully executes,
respond naturally and briefly to the user.

Do not claim an action failed if the tool reports success.

Speak naturally and clearly.
Keep responses concise unless the user asks for more detail.
`;

let session = null;
let audioContext = null;
let stream = null;
let processor = null;
let nextPlayTime = 0;

const stateText =
  document.getElementById("state");

const startButton =
  document.getElementById("startButton");

function setState(text) {
  if (stateText) {
    stateText.textContent = text;
  }
}

async function getToken() {
  const response =
    await fetch(
      "http://localhost:3000/token"
    );

  if (!response.ok) {
    throw new Error(
      "Could not get Live API token."
    );
  }

  const data =
    await response.json();

  if (!data.token) {
    throw new Error(
      "Token was not returned by the server."
    );
  }

  return data.token;
}

function floatTo16BitPCM(
  float32Array
) {
  const buffer =
    new ArrayBuffer(
      float32Array.length * 2
    );

  const view =
    new DataView(buffer);

  for (
    let i = 0;
    i < float32Array.length;
    i++
  ) {
    const sample =
      Math.max(
        -1,
        Math.min(
          1,
          float32Array[i]
        )
      );

    view.setInt16(
      i * 2,
      sample < 0
        ? sample * 0x8000
        : sample * 0x7fff,
      true
    );
  }

  return new Uint8Array(buffer);
}

function arrayBufferToBase64(
  buffer
) {
  let binary = "";

  const bytes =
    new Uint8Array(buffer);

  for (
    let i = 0;
    i < bytes.length;
    i++
  ) {
    binary += String.fromCharCode(
      bytes[i]
    );
  }

  return btoa(binary);
}

function playPCMChunk(
  base64Audio
) {
  if (!audioContext) {
    return;
  }

  try {
    const binary =
      atob(base64Audio);

    const bytes =
      new Uint8Array(
        binary.length
      );

    for (
      let i = 0;
      i < binary.length;
      i++
    ) {
      bytes[i] =
        binary.charCodeAt(i);
    }

    const pcm16 =
      new Int16Array(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength / 2
      );

    const audioBuffer =
      audioContext.createBuffer(
        1,
        pcm16.length,
        24000
      );

    const channel =
      audioBuffer.getChannelData(0);

    for (
      let i = 0;
      i < pcm16.length;
      i++
    ) {
      channel[i] =
        pcm16[i] / 32768;
    }

    const source =
      audioContext.createBufferSource();

    source.buffer =
      audioBuffer;

    source.connect(
      audioContext.destination
    );

    const currentTime =
      audioContext.currentTime;

    if (
      nextPlayTime <
      currentTime
    ) {
      nextPlayTime =
        currentTime;
    }

    source.start(
      nextPlayTime
    );

    nextPlayTime +=
      audioBuffer.duration;

  } catch (error) {
    console.error(
      "Audio playback error:",
      error
    );
  }
}

async function startMicrophone() {
  stream =
    await navigator.mediaDevices
      .getUserMedia({
        audio: true
      });

  audioContext =
    new AudioContext({
      sampleRate: 16000
    });

  await audioContext.resume();

  const source =
    audioContext.createMediaStreamSource(
      stream
    );

  processor =
    audioContext.createScriptProcessor(
      4096,
      1,
      1
    );

  processor.onaudioprocess =
    (event) => {
      if (!session) {
        return;
      }

      const input =
        event.inputBuffer
          .getChannelData(0);

      const pcm =
        floatTo16BitPCM(
          input
        );

      const base64Audio =
        arrayBufferToBase64(
          pcm
        );

      session.sendRealtimeInput({
        audio: {
          data: base64Audio,
          mimeType:
            "audio/pcm;rate=16000"
        }
      });
    };

  source.connect(
    processor
  );

  processor.connect(
    audioContext.destination
  );

  console.log(
    "JOJO microphone started."
  );
}

/*
  WEBSITE ACTION
*/

async function executeWebsiteAction(
  functionCall
) {
  const url =
    functionCall.args?.url;

  if (!url) {
    console.error(
      "openWebsite was called without a URL."
    );

    session?.sendToolResponse({
      functionResponses: [
        {
          id:
            functionCall.id,

          name:
            functionCall.name,

          response: {
            output:
              "The website could not be opened because no URL was provided."
          }
        }
      ]
    });

    return;
  }

  try {
    const response =
      await fetch(
        "http://localhost:3000/action",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              action:
                "openWebsite",

              value:
                url
            })
        }
      );

    const responseText =
      await response.text();

    console.log(
      "ACTION HTTP STATUS:",
      response.status
    );

    console.log(
      "ACTION RAW RESPONSE:",
      responseText
    );

    let result = null;

    if (
      responseText &&
      responseText.trim().length > 0
    ) {
      try {
        result =
          JSON.parse(
            responseText
          );
      } catch (parseError) {
        console.error(
          "ACTION RESPONSE IS NOT JSON:",
          parseError
        );
      }
    }

    const isSuccess =
      response.ok &&
      (
        result === null ||
        result.success !== false
      );

    console.log(
      "Function action resolved success:",
      isSuccess,
      result
    );

    if (!isSuccess) {
      console.error(
        "Website action failed:",
        result || responseText
      );

      session?.sendToolResponse({
        functionResponses: [
          {
            id:
              functionCall.id,

            name:
              functionCall.name,

            response: {
              output:
                "The website could not be opened."
            }
          }
        ]
      });

      return;
    }

    session?.sendToolResponse({
      functionResponses: [
        {
          id:
            functionCall.id,

          name:
            functionCall.name,

          response: {
            output:
              "The website was opened successfully."
          }
        }
      ]
    });

  } catch (error) {
    console.error(
      "Function action failed:",
      error
    );

    session?.sendToolResponse({
      functionResponses: [
        {
          id:
            functionCall.id,

          name:
            functionCall.name,

          response: {
            output:
              "The website could not be opened."
          }
        }
      ]
    });
  }
}

/*
  SAVE MEMORY
*/

async function saveUserMemory(
  userText
) {
  const rememberMatch =
    userText.match(
      /remember(?: that)? (?:my )?(.+?) is (.+)/i
    );

  if (!rememberMatch) {
    return false;
  }

  const key =
    rememberMatch[1]
      .trim()
      .toLowerCase()
      .replace(
        /\s+/g,
        "_"
      );

  const value =
    rememberMatch[2]
      .trim();

  try {
    const response =
      await fetch(
        "http://localhost:3000/memory",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              key:
                key,

              value:
                value
            })
        }
      );

    const responseText =
      await response.text();

    console.log(
      "MEMORY HTTP STATUS:",
      response.status
    );

    console.log(
      "MEMORY RAW RESPONSE:",
      responseText
    );

    let result = null;

    if (
      responseText &&
      responseText.trim().length > 0
    ) {
      try {
        result =
          JSON.parse(
            responseText
          );
      } catch (parseError) {
        console.error(
          "MEMORY RESPONSE IS NOT JSON:",
          parseError
        );
      }
    }

    if (
      response.ok &&
      result?.success !== false
    ) {
      console.log(
        "JOJO memory saved successfully:",
        key,
        "=",
        value
      );

      return true;
    }

    console.error(
      "JOJO memory save failed:",
      result || responseText
    );

  } catch (error) {
    console.error(
      "Memory save failed:",
      error
    );
  }

  return false;
}

/*
  FORGET MEMORY
*/

async function forgetUserMemory(
  userText
) {
  const normalizedText =
    userText
      .trim()
      .replace(
        /[.!?]+$/g,
        ""
      );

  const forgetMatch =
    normalizedText.match(
      /^forget(?: that)? (?:my )?(.+)$/i
    );

  console.log(
    "FORGET CHECK:",
    normalizedText
  );

  if (!forgetMatch) {
    return false;
  }

  const key =
    forgetMatch[1]
      .trim()
      .toLowerCase()
      .replace(
        /\s+/g,
        "_"
      );

  console.log(
    "FORGET KEY:",
    key
  );

  try {
    const response =
      await fetch(
        `http://localhost:3000/memory/${encodeURIComponent(
          key
        )}`,
        {
          method: "DELETE"
        }
      );

    const responseText =
      await response.text();

    console.log(
      "FORGET HTTP STATUS:",
      response.status
    );

    console.log(
      "FORGET RAW RESPONSE:",
      responseText
    );

    let result = null;

    if (
      responseText &&
      responseText.trim().length > 0
    ) {
      try {
        result =
          JSON.parse(
            responseText
          );
      } catch (parseError) {
        console.error(
          "FORGET RESPONSE IS NOT JSON:",
          parseError
        );
      }
    }

    if (
      response.ok &&
      result?.success === true
    ) {
      console.log(
        "JOJO memory forgotten:",
        key
      );

      return true;
    }

    console.error(
      "JOJO memory forget failed:",
      result || responseText
    );

  } catch (error) {
    console.error(
      "Memory forget failed:",
      error
    );
  }

  return false;
}

/*
  JOJO LIVE SESSION
*/

async function startJojo() {
  try {
    setState(
      "Connecting..."
    );

    const token =
      await getToken();

    const ai =
      new GoogleGenAI({
        apiKey: token,

        httpOptions: {
          apiVersion:
            "v1alpha"
        }
      });

    session =
      await ai.live.connect({
        model:
          MODEL,

        config: {
          responseModalities: [
            "AUDIO"
          ],

          inputAudioTranscription: {},

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
          ],

          toolConfig: {
            functionCallingConfig: {
              mode:
                "ANY",

              allowedFunctionNames: [
                "openWebsite"
              ]
            }
          }
        },

        callbacks: {
          onopen:
            async () => {
              console.log(
                "Gemini Live connected."
              );

              setState(
                "Connected"
              );

              try {
                await startMicrophone();

                setState(
                  "Listening"
                );

                console.log(
                  "JOJO microphone ready."
                );

              } catch (error) {
                console.error(
                  "Microphone error:",
                  error
                );

                setState(
                  "Mic error"
                );
              }
            },

          onmessage:
            async (
              message
            ) => {
              console.log(
                "Live message:",
                message
              );

              const content =
                message.serverContent;

              /*
                DIRECT TOOL CALL
              */

              if (
                message.toolCall?.functionCalls
              ) {
                for (
                  const functionCall of
                    message.toolCall.functionCalls
                ) {
                  console.log(
                    "JOJO direct function call:",
                    functionCall
                  );

                  if (
                    functionCall.name ===
                    "openWebsite"
                  ) {
                    await executeWebsiteAction(
                      functionCall
                    );
                  }
                }
              }

              /*
                USER TRANSCRIPTION
              */

              if (
                content
                  ?.inputTranscription
                  ?.text
              ) {
                const userText =
                  content
                    .inputTranscription
                    .text
                    .trim();

                console.log(
                  "USER SAID:",
                  userText
                );

                /*
                  FORGET MEMORY
                */

                await forgetUserMemory(
                  userText
                );

                /*
                  SAVE MEMORY
                */

                await saveUserMemory(
                  userText
                );
              }

              /*
                MODEL TURN PARTS
              */

              if (
                content
                  ?.modelTurn
                  ?.parts
              ) {
                for (
                  const part of
                    content.modelTurn.parts
                ) {
                  /*
                    FUNCTION CALL
                  */

                  if (
                    part.functionCall
                  ) {
                    const functionCall =
                      part.functionCall;

                    console.log(
                      "JOJO function call:",
                      functionCall
                    );

                    if (
                      functionCall.name ===
                      "openWebsite"
                    ) {
                      await executeWebsiteAction(
                        functionCall
                      );
                    }
                  }

                  /*
                    AUDIO RESPONSE
                  */

                  if (
                    part
                      .inlineData
                      ?.data
                  ) {
                    console.log(
                      "JOJO audio response received."
                    );

                    playPCMChunk(
                      part
                        .inlineData
                        .data
                    );
                  }
                }
              }
            },

          onerror:
            (
              error
            ) => {
              console.error(
                "Live API error:",
                error
              );

              setState(
                "Error"
              );
            },

          onclose:
            () => {
              console.log(
                "Gemini Live session closed."
              );

              setState(
                "Disconnected"
              );
            }
        }
      });

    console.log(
      "JOJO V4 Live session ready."
    );

  } catch (error) {
    console.error(
      "JOJO V4 failed:",
      error
    );

    setState(
      "Connection failed"
    );
  }
}

if (startButton) {
  startButton.addEventListener(
    "click",
    startJojo
  );
}