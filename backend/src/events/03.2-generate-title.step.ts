import type { EventConfig, Handlers } from "motia";
import OpenAI from "openai";

export const config: EventConfig = {
  name: "Generate-Video-Title",
  type: "event",
  description: "Generate modern, engaging YouTube titles using Gemini AI",
  flows: ["yt.video.upload"],
  subscribes: ["prompts.generated"],
  emits: [
    { topic: "final.title.generated", label: "Title Generated" },
    { topic: "final.title.generation.error", label: "Title Error", conditional: true },
  ],
};

export const handler: Handlers["Generate-Video-Title"] = async (
  input: any,
  { emit, logger, state }: any
) => {
  const { traceId, title: initialTitle, description, tags } = input;

  try {
    logger.info("Starting title generation", { traceId });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not set");
    }

    const videoData = await state.get(traceId, "videoData");
    const metadata = await state.get(traceId, "metadata");
    const generatedContent = await state.get(traceId, "generatedContent");

    if (!videoData || !metadata) {
      throw new Error("Video data or metadata not found in state");
    }

    if (!metadata.autoGenerateTitle && metadata.title) {
      logger.info("Using user-provided title", { traceId });

      await state.set(traceId, "generatedTitle", {
        title: metadata.title,
        isGenerated: false,
        generatedAt: new Date().toISOString(),
      });

      await emit({
        topic: "final.title.generated",
        data: { traceId, title: metadata.title },
      });

      return;
    }

    await state.set(traceId, "status", {
      status: "generating-title",
      updatedAt: new Date().toISOString(),
    });

    const openai = new OpenAI({
      apiKey,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    });

    const previousTitle = generatedContent?.title || initialTitle || "";
    const previousDescription = generatedContent?.description || description || metadata.description || "";
    const previousTags = generatedContent?.tags || tags || metadata.tags || [];

    const prompt = `You are a YouTube viral title expert. Analyze the previously generated content and create 5 improved, modern, engaging YouTube titles.

PREVIOUSLY GENERATED CONTENT:
- Initial Title: ${previousTitle}
- Description: ${previousDescription}
- Tags: ${Array.isArray(previousTags) ? previousTags.join(", ") : previousTags}

VIDEO CONTEXT:
- File Name: ${videoData.fileName}
- User Provided Title: ${metadata.title || "Not provided"}

ANALYSIS TASK:
First, analyze the previous title "${previousTitle}" for:
1. Strengths (what works well)
2. Weaknesses (what could be improved)
3. SEO optimization opportunities
4. Emotional appeal assessment

TITLE GENERATION REQUIREMENTS:
1. Use power words that trigger emotions (Amazing, Shocking, Ultimate, Secret, etc.)
2. Include numbers when relevant (5 Ways, 10 Tips, 3 Secrets)
3. Create curiosity gap without being clickbait
4. Keep under 60 characters for full visibility
5. Front-load important keywords for SEO
6. Use brackets/parentheses for emphasis [MUST WATCH] (2024)
7. Match current YouTube trends and patterns
8. Improve upon the previous title's weaknesses

TITLE STYLES TO INCLUDE:
- One "How To" style
- One "List/Number" style  
- One "Question" style
- One "Bold Statement" style
- One "Curiosity Gap" style

Respond in JSON format only:
{
  "previousTitleAnalysis": {
    "strengths": ["strength1", "strength2"],
    "weaknesses": ["weakness1", "weakness2"],
    "seoScore": "1-10",
    "emotionalAppeal": "Low/Medium/High"
  },
  "titles": [
    {
      "title": "Your Generated Title Here",
      "style": "How To / List / Question / Bold / Curiosity",
      "reasoning": "Why this title works and how it improves on the previous",
      "estimatedCTR": "High / Medium",
      "improvements": ["improvement1", "improvement2"]
    }
  ],
  "recommended": 0,
  "recommendedReason": "Why this is the best choice based on analysis"
}`;

    logger.info("Generating titles with Gemini", { traceId, previousTitle });

    const response = await openai.chat.completions.create({
      model: "gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: "You are a YouTube SEO and viral content expert. Generate optimized titles that maximize click-through rates while maintaining authenticity. Always respond with valid JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.8,
      max_tokens: 2000,
      response_format: { type: "json_object" },
    });

    const responseText = response.choices[0]?.message?.content;

    if (!responseText) {
      throw new Error("Empty response from Gemini API");
    }

    let parsedResponse: any;
    try {
      let cleanedContent = responseText.trim();

      if (cleanedContent.startsWith("```json")) {
        cleanedContent = cleanedContent.slice(7);
      } else if (cleanedContent.startsWith("```")) {
        cleanedContent = cleanedContent.slice(3);
      }
      if (cleanedContent.endsWith("```")) {
        cleanedContent = cleanedContent.slice(0, -3);
      }
      cleanedContent = cleanedContent.trim();

      parsedResponse = JSON.parse(cleanedContent);
    } catch (parseError) {
      logger.error("Failed to parse AI response", {
        traceId,
        response: responseText,
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
      previousTitle,
    });

    await state.set(traceId, "generatedTitle", {
      title: recommendedTitle,
      previousTitle,
      previousTitleAnalysis: parsedResponse.previousTitleAnalysis,
      allTitles: titles,
      recommendedIndex,
      recommendedReason: parsedResponse.recommendedReason,
      isGenerated: true,
      generatedAt: new Date().toISOString(),
    });

    await state.set(traceId, "metadata", {
      ...metadata,
      title: recommendedTitle,
    });

    await state.set(traceId, "status", {
      status: "title-generated",
      updatedAt: new Date().toISOString(),
    });

    await emit({
      topic: "final.title.generated",
      data: {
        traceId,
        title: recommendedTitle,
        previousTitle,
        allTitles: titles.map((t: any) => t.title),
        analysis: parsedResponse.previousTitleAnalysis,
      },
    });

  } catch (error: any) {
    logger.error("Error generating title", {
      traceId,
      error: error.message,
      stack: error.stack,
    });

    try {
      await state.set(traceId, "status", {
        status: "title-generation-failed",
        error: error.message,
        updatedAt: new Date().toISOString(),
      });
    } catch {
    }

    await emit({
      topic: "final.title.generation.error",
      data: {
        traceId,
        error: error.message,
        step: "generate-title",
      },
    });
  }
};
