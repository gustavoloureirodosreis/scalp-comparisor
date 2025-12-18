import { NextRequest } from "next/server";

export const runtime = "nodejs";

// Model configuration
export type ModelId = "scalp-density-detector" | "nivel-de-cabelo";

type ModelConfig = {
    id: ModelId;
    name: string;
    type: "detect" | "workflow";
    url: string;
    prompt?: string;
};

export const MODELS: Record<ModelId, ModelConfig> = {
    "scalp-density-detector": {
        id: "scalp-density-detector",
        name: "Scalp Density Detector v4",
        type: "detect",
        url: "https://detect.roboflow.com/scalp-density-detector/4",
    },
    "nivel-de-cabelo": {
        id: "nivel-de-cabelo",
        name: "Nivel de Cabelo (Legacy)",
        type: "workflow",
        url: "https://serverless.roboflow.com/gustavos-training-workspace/workflows/nivel-de-cabelo",
        prompt: "bald spot",
    },
};

export const DEFAULT_MODEL: ModelId = "scalp-density-detector";

// Step progress types
type StepStatus = "pending" | "running" | "completed";
type StepName = "validate" | "prepare" | "analyze_before" | "analyze_after" | "finalize";

type StepProgress = {
    step: StepName;
    label: string;
    status: StepStatus;
    duration?: number; // ms
};

type ProgressEvent = {
    type: "progress";
    steps: StepProgress[];
    currentStep: StepName;
};

type CompleteEvent = {
    type: "complete";
    steps: StepProgress[];
    totalDuration: number;
    result: AnalysisResponse;
};

type ErrorEvent = {
    type: "error";
    error: string;
};

type SSEEvent = ProgressEvent | CompleteEvent | ErrorEvent;

type RoboflowPrediction = {
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
    class: string;
    points?: { x: number; y: number }[];
};

type ImageResult = {
    area: number;
    areaPercentage: number;
    imageWidth: number;
    imageHeight: number;
    confidence: number;
    detected: boolean;
    boundingBox?: { x: number; y: number; width: number; height: number };
    allPolygons?: { x: number; y: number }[][];
    maskImage?: string;
};

type AnalysisResponse = {
    before: ImageResult;
    after: ImageResult;
};

async function blobToBase64(blob: Blob): Promise<string> {
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return buffer.toString("base64");
}

function isBlobLike(value: unknown): value is Blob {
    return (
        typeof value === "object" &&
        value !== null &&
        "arrayBuffer" in value &&
        typeof (value as { arrayBuffer: unknown }).arrayBuffer === "function"
    );
}

// Calculate polygon area using Shoelace formula
function calculatePolygonArea(points: { x: number; y: number }[]): number {
    if (!points || points.length < 3) return 0;

    let area = 0;
    const n = points.length;

    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
    }

    return Math.abs(area / 2);
}

async function callRoboflowAPI(
    base64Image: string,
    apiKey: string,
    confidence: number,
    model: ModelConfig
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
    let url: string;
    let body: string;

    if (model.type === "detect") {
        // Object detection API
        url = `${model.url}?api_key=${apiKey}&confidence=${Math.round(confidence * 100)}`;
        body = base64Image;
    } else {
        // Workflow API
        url = model.url;
        body = JSON.stringify({
            api_key: apiKey,
            inputs: {
                image: { type: "base64", value: base64Image },
                confidence,
                prompts: model.prompt || "bald spot",
            },
        });
    }

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": model.type === "detect" ? "application/x-www-form-urlencoded" : "application/json",
        },
        body,
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Roboflow API error: ${response.status} - ${errorText}`);
    }

    return response.json();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractData(result: any): {
    predictions: RoboflowPrediction[];
    maskImage?: string;
    imageWidth: number;
    imageHeight: number;
} {
    let predictions: RoboflowPrediction[] = [];
    let maskImage: string | undefined;
    let imageWidth = 0;
    let imageHeight = 0;

    if (result.outputs && Array.isArray(result.outputs) && result.outputs.length > 0) {
        const output = result.outputs[0];

        // Extract image dimensions from the response
        if (output.sam?.image?.width && output.sam?.image?.height) {
            imageWidth = output.sam.image.width;
            imageHeight = output.sam.image.height;
        }

        // Extract mask visualization image if available
        if (output.mask_visualization) {
            if (typeof output.mask_visualization === "string") {
                maskImage = output.mask_visualization;
            } else if (output.mask_visualization.value) {
                maskImage = output.mask_visualization.value;
            }
        }

        // Try to find predictions in "sam" output
        if (output.sam) {
            if (Array.isArray(output.sam)) {
                predictions = output.sam;
            } else if (output.sam.predictions) {
                predictions = output.sam.predictions;
            }
        }

        // Fallback: try "predictions" key directly
        if (predictions.length === 0 && output.predictions) {
            if (Array.isArray(output.predictions)) {
                predictions = output.predictions;
            } else if (output.predictions.predictions) {
                predictions = output.predictions.predictions;
            }
        }
    } else if (result.predictions) {
        predictions = result.predictions;
    }

    // Try to get image dimensions from root level
    if (imageWidth === 0 && result.image) {
        imageWidth = result.image.width || 0;
        imageHeight = result.image.height || 0;
    }

    // Infer dimensions from predictions if not available
    if (imageWidth === 0 && predictions.length > 0) {
        for (const pred of predictions) {
            if (pred.points) {
                for (const pt of pred.points) {
                    imageWidth = Math.max(imageWidth, pt.x);
                    imageHeight = Math.max(imageHeight, pt.y);
                }
            } else if (pred.x && pred.width) {
                imageWidth = Math.max(imageWidth, pred.x + pred.width / 2);
                imageHeight = Math.max(imageHeight, pred.y + pred.height / 2);
            }
        }
        // Add some buffer since we're inferring from detection coordinates
        imageWidth = Math.ceil(imageWidth * 1.1);
        imageHeight = Math.ceil(imageHeight * 1.1);
    }

    return { predictions, maskImage, imageWidth, imageHeight };
}

async function analyzeImageWithRoboflow(base64Image: string, model: ModelConfig): Promise<ImageResult> {
    const apiKey = process.env.ROBOFLOW_API_KEY;
    if (!apiKey) {
        throw new Error("Missing ROBOFLOW_API_KEY");
    }

    let confidence = 0.5;
    let descents = 0;
    let predictions: RoboflowPrediction[] = [];
    let maskImage: string | undefined;
    let imageWidth = 0;
    let imageHeight = 0;
    // For detect API, we accept any class; for workflow, filter by prompt
    const filterByClass = model.type === "workflow";

    // Retry with descending confidence until we find results
    while (confidence >= 0.1) {
        const result = await callRoboflowAPI(base64Image, apiKey, confidence, model);
        const extracted = extractData(result);

        // For workflow models, filter by class; for detect models, accept all predictions
        const filtered = filterByClass
            ? (extracted.predictions || []).filter(
                (p) => p.class?.toLowerCase() === (model.prompt || "bald spot").toLowerCase()
            )
            : extracted.predictions || [];

        // Update tracking variables with filtered results if any found
        if (filtered.length > 0) {
            predictions = filtered;
            maskImage = extracted.maskImage;
            imageWidth = extracted.imageWidth;
            imageHeight = extracted.imageHeight;

            if (descents > 0) {
                console.log(`Found results after ${descents} confidence descent(s) (final confidence: ${confidence.toFixed(1)})`);
            }
            break;
        }

        // Store image dimensions from the first valid response
        if (imageWidth === 0 && extracted.imageWidth > 0) {
            imageWidth = extracted.imageWidth;
            imageHeight = extracted.imageHeight;
        }

        confidence -= 0.1;
        descents++;
    }

    if (!predictions || predictions.length === 0) {
        if (descents > 0) {
            console.log(`No results found after ${descents} confidence descent(s)`);
        }
        return {
            area: 0,
            areaPercentage: 0,
            imageWidth,
            imageHeight,
            confidence: 0,
            detected: false
        };
    }

    // Sum up ALL prediction areas (not just the best one)
    let totalArea = 0;
    let maxConfidence = 0;
    const allPolygons: { x: number; y: number }[][] = [];
    let combinedBoundingBox: { x: number; y: number; width: number; height: number } | undefined;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const prediction of predictions) {
        // Track max confidence
        if ((prediction.confidence || 0) > maxConfidence) {
            maxConfidence = prediction.confidence || 0;
        }

        // Calculate area for this prediction
        if (prediction.points && prediction.points.length >= 3) {
            totalArea += calculatePolygonArea(prediction.points);
            allPolygons.push(prediction.points);

            // Update bounding box
            for (const pt of prediction.points) {
                minX = Math.min(minX, pt.x);
                minY = Math.min(minY, pt.y);
                maxX = Math.max(maxX, pt.x);
                maxY = Math.max(maxY, pt.y);
            }
        } else if (prediction.width && prediction.height) {
            totalArea += prediction.width * prediction.height;

            // Update bounding box from this prediction
            const left = prediction.x - prediction.width / 2;
            const top = prediction.y - prediction.height / 2;
            const right = prediction.x + prediction.width / 2;
            const bottom = prediction.y + prediction.height / 2;
            minX = Math.min(minX, left);
            minY = Math.min(minY, top);
            maxX = Math.max(maxX, right);
            maxY = Math.max(maxY, bottom);
        }
    }

    if (totalArea === 0) {
        return {
            area: 0,
            areaPercentage: 0,
            imageWidth,
            imageHeight,
            confidence: 0,
            detected: false
        };
    }

    // Create combined bounding box
    if (minX !== Infinity) {
        combinedBoundingBox = {
            x: (minX + maxX) / 2,
            y: (minY + maxY) / 2,
            width: maxX - minX,
            height: maxY - minY,
        };
    }

    // Calculate area as percentage of total image area
    const totalImageArea = imageWidth * imageHeight;
    const areaPercentage = totalImageArea > 0 ? (totalArea / totalImageArea) * 100 : 0;

    return {
        area: Math.round(totalArea),
        areaPercentage: Math.round(areaPercentage * 100) / 100, // 2 decimal places
        imageWidth,
        imageHeight,
        confidence: Math.round(maxConfidence * 100),
        detected: true,
        boundingBox: combinedBoundingBox,
        allPolygons: allPolygons.length > 0 ? allPolygons : undefined,
        maskImage,
    };
}

// Helper to create initial steps state
function createInitialSteps(): StepProgress[] {
    return [
        { step: "validate", label: "Validating request", status: "pending" },
        { step: "prepare", label: "Preparing images", status: "pending" },
        { step: "analyze_before", label: "Analyzing before image", status: "pending" },
        { step: "analyze_after", label: "Analyzing after image", status: "pending" },
        { step: "finalize", label: "Generating results", status: "pending" },
    ];
}

export async function POST(req: NextRequest) {
    const encoder = new TextEncoder();
    const totalStartTime = performance.now();

    const stream = new ReadableStream({
        async start(controller) {
            const steps = createInitialSteps();
            let stepStartTime = performance.now();

            // Helper to send SSE event
            function sendEvent(event: SSEEvent) {
                const data = `data: ${JSON.stringify(event)}\n\n`;
                controller.enqueue(encoder.encode(data));
            }

            // Helper to update step status and send progress
            function updateStep(stepName: StepName, status: StepStatus, duration?: number) {
                const step = steps.find(s => s.step === stepName);
                if (step) {
                    step.status = status;
                    if (duration !== undefined) {
                        step.duration = Math.round(duration);
                    }
                }
                if (status === "running") {
                    sendEvent({ type: "progress", steps: [...steps], currentStep: stepName });
                } else if (status === "completed") {
                    sendEvent({ type: "progress", steps: [...steps], currentStep: stepName });
                }
            }

            // Helper to start a step and return its start time
            function startStep(stepName: StepName): number {
                stepStartTime = performance.now();
                updateStep(stepName, "running");
                return stepStartTime;
            }

            // Helper to complete a step
            function completeStep(stepName: StepName, startTime: number) {
                const duration = performance.now() - startTime;
                updateStep(stepName, "completed", duration);
            }

            try {
                // Step 1: Validate request
                let start = startStep("validate");
                const formData = await req.formData();
                const before = formData.get("before");
                const after = formData.get("after");
                const modelId = (formData.get("model") as string) || DEFAULT_MODEL;

                if (!isBlobLike(before) || !isBlobLike(after)) {
                    sendEvent({ type: "error", error: "Both 'before' and 'after' images are required" });
                    controller.close();
                    return;
                }

                const model = MODELS[modelId as ModelId] || MODELS[DEFAULT_MODEL];

                const apiKey = process.env.ROBOFLOW_API_KEY;
                if (!apiKey) {
                    sendEvent({ type: "error", error: "Missing ROBOFLOW_API_KEY" });
                    controller.close();
                    return;
                }
                completeStep("validate", start);

                // Step 2: Prepare images (convert to base64)
                start = startStep("prepare");
                const [beforeB64, afterB64] = await Promise.all([
                    blobToBase64(before),
                    blobToBase64(after),
                ]);
                completeStep("prepare", start);

                // Step 3 & 4: Analyze both images in parallel
                const analyzeStart = performance.now();
                updateStep("analyze_before", "running");
                updateStep("analyze_after", "running");

                const [beforeResult, afterResult] = await Promise.all([
                    analyzeImageWithRoboflow(beforeB64, model).then(result => {
                        completeStep("analyze_before", analyzeStart);
                        return result;
                    }),
                    analyzeImageWithRoboflow(afterB64, model).then(result => {
                        completeStep("analyze_after", analyzeStart);
                        return result;
                    }),
                ]);

                // Step 5: Finalize results
                start = startStep("finalize");
                const response: AnalysisResponse = {
                    before: beforeResult,
                    after: afterResult,
                };
                completeStep("finalize", start);

                // Send complete event with total duration
                const totalDuration = Math.round(performance.now() - totalStartTime);
                sendEvent({
                    type: "complete",
                    steps: [...steps],
                    totalDuration,
                    result: response,
                });

                controller.close();
            } catch (error: unknown) {
                const message =
                    error instanceof Error
                        ? error.message
                        : typeof error === "string"
                            ? error
                            : "Unexpected error";
                sendEvent({ type: "error", error: message });
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    });
}
