import { Data } from "effect"

export class EngramError extends Data.TaggedError("EngramError")<{
  message: string
}> {}
