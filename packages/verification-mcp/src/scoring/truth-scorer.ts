import type { TruthAssessment } from "./types.js";

const BASE_CONFIDENCE = 0.8;
const MIN_MEANINGFUL_LENGTH = 10;

const FORMAT_INDICATORS: Record<string, readonly string[]> = {
  json: ["{", "[", "}", "]"],
  markdown: ["#", "-", "*", "`"],
  code: ["function", "class", "const", "import", "export"],
};

function determineSuggestedAction(confidence: number): "accept" | "review" | "reject" {
  if (confidence >= 0.7) {
    return "accept";
  }
  if (confidence >= 0.4) {
    return "review";
  }
  return "reject";
}

function checkFormatCompliance(output: string, expectedFormat: string): boolean {
  const formatKey = expectedFormat.toLowerCase();
  const indicators = FORMAT_INDICATORS[formatKey];

  if (indicators === undefined) {
    return true;
  }

  return indicators.some((indicator) => output.includes(indicator));
}

export function assessTruth(params: {
  readonly output: string;
  readonly expectedFormat?: string;
  readonly sourceContext?: string;
}): TruthAssessment {
  const { output, expectedFormat } = params;

  if (output.length === 0) {
    return {
      confidence: 0,
      flags: ["empty_output"],
      suggestedAction: "reject",
    };
  }

  if (output.length < MIN_MEANINGFUL_LENGTH) {
    return {
      confidence: 0.3,
      flags: ["suspiciously_short"],
      suggestedAction: "review",
    };
  }

  let confidence = BASE_CONFIDENCE;
  const flags: string[] = [];

  if (expectedFormat !== undefined && expectedFormat.length > 0) {
    const complies = checkFormatCompliance(output, expectedFormat);
    if (!complies) {
      confidence -= 0.2;
      flags.push(`format_mismatch_${expectedFormat}`);
    }
  }

  if (output.trim() !== output) {
    flags.push("leading_trailing_whitespace");
  }

  const clampedConfidence = Math.max(0, Math.min(1, confidence));

  return {
    confidence: clampedConfidence,
    flags,
    suggestedAction: determineSuggestedAction(clampedConfidence),
  };
}
