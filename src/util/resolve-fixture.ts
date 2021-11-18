import { inspect } from "util";
import { cwd } from "../constants";

const cwdRegExp = new RegExp(escapeRegExp(cwd), "gi");
const inspectOpts: Parameters<typeof inspect>[1] = {
  depth: null,
  sorted: true,
  colors: false,
  getters: "get",
  compact: false,
  showHidden: true,
  maxArrayLength: null,
  maxStringLength: null,
};

export default async function resolveFixture(fixture: unknown) {
  let output = fixture;
  let error: Error | undefined;

  if (typeof fixture === "function") {
    const trackedErrors: Error[] = [];
    const addError = (ev: Error | ErrorEvent) => {
      const curErr = (ev as ErrorEvent).error || (ev as Error);
      if (!trackedErrors.includes(curErr)) {
        trackedErrors.push(curErr);
      }
    };

    if (typeof window === "object") {
      window.addEventListener("error", addError as any);
      window.addEventListener("unhandledrejection", addError as any);
    } else if (typeof process === "object") {
      process.on("uncaughtException", addError);
      process.on("unhandledRejection", addError);
    }

    try {
      output = await fixture();
    } catch (curErr) {
      addError(curErr as Error);
    } finally {
      if (typeof window === "object") {
        window.removeEventListener("error", addError as any);
        window.removeEventListener("unhandledrejection", addError as any);
      } else if (typeof process === "object") {
        process.removeListener("uncaughtException", addError);
        process.removeListener("unhandledRejection", addError);
      }
    }

    error = mergeErrors(trackedErrors);

    if (error) {
      output = stripAnsiCodes(
        isAggregationError(error)
          ? error.errors.map((it) => it.message).join("\n\n")
          : error.message
      ).replace(cwdRegExp, ".");
    }
  }

  return {
    error,
    output: typeof output === "string" ? output : inspect(output, inspectOpts),
  };
}

function mergeErrors(errors: Error[]) {
  switch (errors.length) {
    case 0:
      return;
    case 1:
      return errors[0];
    default: {
      const message = `\n${errors
        .map((it) => inspect(it))
        .join("\n\n")
        .replace(/^(?!\s*$)/gm, "    ")}\n`;

      if (typeof AggregateError === "function") {
        return new AggregateError(errors, message);
      }

      const error = new Error(message);
      (error as AggregateError).errors = errors;
      return error;
    }
  }
}

function stripAnsiCodes(str: string) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B[[(?);]{0,2}(;?\d)*./g, "");
}

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isAggregationError(error: Error): error is AggregateError {
  return !!(error as AggregateError).errors;
}