import mongoose, { model, models, type Model, type Schema } from "mongoose";

/**
 * Register a Mongoose model once per process.
 *
 * In development, hot reload re-runs the model file after an edit. Reusing the
 * already-compiled model would keep the OLD schema, and Mongoose silently drops
 * fields it doesn't know (a new field just never saves). So in development the
 * old model is replaced; in production the first one is reused.
 */
export function defineModel<T>(name: string, schema: Schema): Model<T> {
  if (models[name] && process.env.NODE_ENV !== "production") mongoose.deleteModel(name);
  // Typed by the caller: letting TypeScript infer through Mongoose's generics here is very slow.
  return (models[name] ?? model(name, schema)) as unknown as Model<T>;
}
