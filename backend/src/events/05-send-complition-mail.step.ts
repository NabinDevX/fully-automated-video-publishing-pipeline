import type { EventConfig, Handlers } from "motia";
import { getFirstConnectedUser } from "../helper/oauth";

export const config: EventConfig = {
  name: "Send the success email",
  type: "event",
  description: "Send email notification upon successful YouTube upload",
  flows: ["yt.video.upload"],
  subscribes: ["youtube.upload.completed"],
  emits: [
    { topic: "pipeline.error", label: "Email Send Error", conditional: true },
  ],
};

interface UploadCompletedInput {
  traceId: string;
  videoId: string;
  videoUrl: string;
  title: string;
  privacy: string;
  thumbnailUploaded: boolean;
}

interface UploadResult {
  channelTitle: string;
  uploadedAt: string;
}

interface ConnectedUser {
  email: string;
  name?: string;
  channelTitle?: string;
}

export const handler: Handlers["Send the success email"] = async (
  input: UploadCompletedInput,
  { emit, logger, state }: any
) => {
  const { traceId, videoId, videoUrl, title, privacy, thumbnailUploaded } = input;

  try {
    logger.info("Starting email notification", { traceId, videoId });

    const uploadResult: UploadResult | null = await state.get(traceId, "uploadResult");

    const connectedUser = await getFirstConnectedUser() as ConnectedUser | null;

    if (!connectedUser || !connectedUser.email) {
      logger.warn("No connected YouTube user email found, skipping email notification", { traceId });
      return;
    }

    const userEmail = connectedUser.email;

    logger.info("Sending email to authenticated YouTube user", {
      traceId,
      email: userEmail,
    });

    if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) {
      logger.warn("Brevo not configured, skipping email notification", { traceId });
      return;
    }

    const channelTitle = uploadResult?.channelTitle || connectedUser.channelTitle || "your YouTube channel";
    const uploadedAt = uploadResult?.uploadedAt
      ? new Date(uploadResult.uploadedAt).toLocaleString()
      : new Date().toLocaleString();

    const emailSubject = `✅ Video Published: "${title}"`;

    const emailTextContent = `
Hi ${connectedUser.name || "there"}!

Great news! Your video has been successfully uploaded to YouTube.

📹 VIDEO DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Title: ${title}
Channel: ${channelTitle}
Privacy: ${privacy}
Thumbnail: ${thumbnailUploaded ? "✅ Uploaded" : "❌ Not uploaded"}
Uploaded At: ${uploadedAt}

🔗 WATCH YOUR VIDEO
${videoUrl}

📊 VIDEO ID
${videoId}

${thumbnailUploaded ? "" : "⚠️ Note: Custom thumbnail upload may have failed. You can manually add a thumbnail in YouTube Studio."}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Thank you for using our Video Publishing Pipeline!

---
Video Publishing Pipeline
© ${new Date().getFullYear()} All rights reserved.
    `.trim();

    const emailHtmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #ff0000, #cc0000); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">🎉 Video Published Successfully!</h1>
  </div>
  
  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px; margin-bottom: 20px;">Hi ${connectedUser.name || "there"}!</p>
    
    <p style="font-size: 16px; margin-bottom: 20px;">
      Great news! Your video has been successfully uploaded to YouTube.
    </p>
    
    <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #ff0000; margin-bottom: 20px;">
      <h2 style="margin: 0 0 15px 0; color: #333; font-size: 18px;">📹 Video Details</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #666; width: 120px;"><strong>Title:</strong></td>
          <td style="padding: 8px 0; color: #333;">${title}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Channel:</strong></td>
          <td style="padding: 8px 0; color: #333;">${channelTitle}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Privacy:</strong></td>
          <td style="padding: 8px 0; color: #333;">${privacy}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Thumbnail:</strong></td>
          <td style="padding: 8px 0; color: ${thumbnailUploaded ? "#28a745" : "#dc3545"};">
            ${thumbnailUploaded ? "✅ Uploaded" : "❌ Not uploaded"}
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Uploaded At:</strong></td>
          <td style="padding: 8px 0; color: #333;">${uploadedAt}</td>
        </tr>
      </table>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${videoUrl}" 
         style="display: inline-block; background: #ff0000; color: white; padding: 15px 40px; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold;">
        ▶️ Watch Your Video
      </a>
    </div>
    
    <div style="background: #e9ecef; padding: 15px; border-radius: 5px; text-align: center; margin-bottom: 20px;">
      <p style="margin: 0; color: #666; font-size: 14px;">Video ID: <code style="background: #ddd; padding: 2px 6px; border-radius: 3px;">${videoId}</code></p>
    </div>
    
    ${!thumbnailUploaded ? `
    <div style="background: #fff3cd; padding: 15px; border-radius: 5px; border-left: 4px solid #ffc107; margin-bottom: 20px;">
      <p style="margin: 0; color: #856404; font-size: 14px;">
        ⚠️ <strong>Note:</strong> Custom thumbnail upload may have failed. You can manually add a thumbnail in YouTube Studio.
      </p>
    </div>
    ` : ""}
    
    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
    
    <p style="font-size: 14px; color: #666; text-align: center; margin: 0;">
      Thank you for using our Video Publishing Pipeline!<br>
      © ${new Date().getFullYear()} All rights reserved.
    </p>
  </div>
</body>
</html>
    `.trim();

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": process.env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: {
          name: "Video Publishing Pipeline",
          email: process.env.BREVO_SENDER_EMAIL,
        },
        to: [{ email: userEmail }],
        subject: emailSubject,
        textContent: emailTextContent,
        htmlContent: emailHtmlContent,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Failed to send email: ${errorData.message || response.statusText}`);
    }

    logger.info("Confirmation email sent successfully", {
      traceId,
      videoId,
      to: userEmail,
    });

    await state.set(traceId, "emailNotification", {
      sent: true,
      to: userEmail,
      sentAt: new Date().toISOString(),
    });

  } catch (error: any) {
    logger.error("Error sending confirmation email", {
      traceId,
      error: error.message,
    });

    await state.set(traceId, "emailNotification", {
      sent: false,
      error: error.message,
      failedAt: new Date().toISOString(),
    });

    await emit({
      topic: "pipeline.error",
      data: {
        traceId,
        step: "send-email",
        error: error.message,
        videoId,
      },
    });
  }
};