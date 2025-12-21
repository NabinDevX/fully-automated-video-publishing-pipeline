import type { EventConfig, Handlers } from "motia";
import { GoogleGenAI } from "@google/genai";

export const config: EventConfig = {
  name: "Generate-Video-Title",
  type: "event",
  description: "Generate modern, engaging YouTube titles using Gemini AI",
  flows: ["yt.video.upload"],
  subscribes: ["initial.title.generated"],
  emits: [
    { topic: "final.title.generated", label: "Title Generated" },
    { topic: "final.title.generation.error", label: "Title Error", conditional: true },
  ],
};

export const handler: Handlers["Generate-Video-Title"] = async (
  input: any,
  { emit, logger, state }: any
) => {
  const { traceId } = input;

  try {
    logger.info("Starting title generation", { traceId });

    // Check for API key
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not set");
    }

    // Get data from state
    const videoData = await state.get(traceId, "videoData");
    const metadata = await state.get(traceId, "metadata");

    if (!videoData || !metadata) {
      throw new Error("Video data or metadata not found in state");
    }

    // Check if auto-generate is enabled
    if (!metadata.autoGenerateTitle && metadata.title) {
      logger.info("Using user-provided title", { traceId });

      await state.set(traceId, "generatedTitle", {
        title: metadata.title,
        isGenerated: false,
        generatedAt: new Date().toISOString(),
      });

      await emit({
        topic: "title.generated",
        data: { traceId, title: metadata.title },
      });

      return;
    }

    // Update status
    await state.set(traceId, "status", {
      status: "generating-title",
      updatedAt: new Date().toISOString(),
    });

    // Initialize Gemini AI
    const genAI = new GoogleGenAI({ apiKey });

    const prompt = `You are a YouTube viral title expert. Generate 5 modern, engaging YouTube titles for a video.

Video Context:
- File Name: ${videoData.fileName}
- User Context: ${metadata.title || "Not provided"}
- Description Hint: ${metadata.description || "Not provided"}
- Tags: ${metadata.tags?.join(", ") || "Not provided"}

Requirements for titles:
1. Use power words that trigger emotions (Amazing, Shocking, Ultimate, Secret, etc.)
2. Include numbers when relevant (5 Ways, 10 Tips, 3 Secrets)
3. Create curiosity gap without being clickbait
4. Keep under 60 characters for full visibility
5. Front-load important keywords for SEO
6. Use brackets/parentheses for emphasis [MUST WATCH] (2024)
7. Match current YouTube trends and patterns

Title Styles to Include:
- One "How To" style
- One "List/Number" style  
- One "Question" style
- One "Bold Statement" style
- One "Curiosity Gap" style

Respond in JSON format only:
{
  "titles": [
    {
      "title": "Your Generated Title Here",
      "style": "How To / List / Question / Bold / Curiosity",
      "reasoning": "Why this title works",
      "estimatedCTR": "High / Medium"
    }
  ],
  "recommended": 0,
  "recommendedReason": "Why this is the best choice"
}`;

    logger.info("Generating titles with Gemini", { traceId });

    const response = await genAI.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: {
        temperature: 0.8,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 1024,
      },
    });

    // Extract text response
    const responseText = response.text;

    if (!responseText) {
      throw new Error("Empty response from Gemini API");
    }

    // Parse JSON from response
    let parsedResponse: any;
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }
      parsedResponse = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      logger.error("Failed to parse AI response", {
        traceId,
        response: responseText
      });
      throw new Error("Failed to parse title response from AI");
    }

    const titles = parsedResponse.titles || [];
    const recommendedIndex = parsedResponse.recommended || 0;
    const recommendedTitle = titles[recommendedIndex]?.title || titles[0]?.title;

    if (!recommendedTitle) {
      throw new Error("No titles generated");
    }

    logger.info("Titles generated successfully", {
      traceId,
      count: titles.length,
      recommended: recommendedTitle,
    });

    // Store all titles and recommended one in state
    await state.set(traceId, "generatedTitle", {
      title: recommendedTitle,
      allTitles: titles,
      recommendedIndex,
      recommendedReason: parsedResponse.recommendedReason,
      isGenerated: true,
      generatedAt: new Date().toISOString(),
    });

    // Update status
    await state.set(traceId, "status", {
      status: "title-generated",
      updatedAt: new Date().toISOString(),
    });

    await emit({
      topic: "title.generated",
      data: {
        traceId,
        title: recommendedTitle,
        allTitles: titles.map((t: any) => t.title),
      },
    });
  } catch (error: any) {
    logger.error("Error generating title", {
      traceId,
      error: error.message,
      stack: error.stack,
    });

    // Update status to failed
    await state.set(traceId, "status", {
      status: "title-generation-failed",
      error: error.message,
      updatedAt: new Date().toISOString(),
    });

    await emit({
      topic: "title.generation.error",
      data: {
        traceId,
        error: error.message,
      },
    });
  }
};
