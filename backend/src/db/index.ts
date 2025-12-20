import mongoose from "mongoose";

let isConnected = false;

export async function connectMongo() {
  if (isConnected) return;

  const mongoUri = process.env.MONGODB_URI;
  const dbName = process.env.DB_NAME || "youtube";

  if (!mongoUri) {
    throw new Error("MONGODB_URI environment variable is not defined");
  }

  if (!mongoUri.startsWith("mongodb://") && !mongoUri.startsWith("mongodb+srv://")) {
    throw new Error("MONGODB_URI must start with 'mongodb://' or 'mongodb+srv://'");
  }

  const uri = mongoUri.endsWith("/")
    ? `${mongoUri}${dbName}`
    : `${mongoUri}/${dbName}`;

  try {
    await mongoose.connect(uri);
    isConnected = true;
    console.log(`✅ MongoDB connected to database: ${dbName}`);
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error);
    throw error;
  }
}

mongoose.connection.on("disconnected", () => {
  isConnected = false;
  console.log("⚠️ MongoDB disconnected");
});
