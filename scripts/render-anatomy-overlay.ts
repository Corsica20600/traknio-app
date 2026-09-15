import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import sharp from "sharp";
import {
  anatomyColorByRole,
  anatomyReferenceLayers,
  blockedExerciseAnatomyRecipes,
  type AnatomyReferenceLayerKey,
} from "../src/lib/anatomy-reference-library";

const root = process.cwd();

export type RenderAnatomyOverlayInput = {
  primaryLayer: AnatomyReferenceLayerKey;
  secondaryLayer: AnatomyReferenceLayerKey;
  primaryOutput: string;
  secondaryOutput: string;
};

/**
 * Deterministic anatomy renderer. It only transforms the approved V1 raster
 * layers: crop, optional role recolour, and WebP encoding. No image model and
 * no database access are involved.
 */
export async function renderAnatomyOverlay({
  primaryLayer,
  secondaryLayer,
  primaryOutput,
  secondaryOutput,
}: RenderAnatomyOverlayInput) {
  const renderLayer = async (key: AnatomyReferenceLayerKey, output: string, targetTone: "PRIMARY" | "SECONDARY") => {
    const layer = anatomyReferenceLayers[key];
    const source = join(root, "public", layer.source);
    const sourceImage = sharp(source);
    const { width, height } = await sourceImage.metadata();
    if (!width || !height) throw new Error(`Unable to read anatomy layer: ${layer.source}`);

    const [left, top, cropWidth, cropHeight] = layer.crop ?? [0, 0, 1, 1];
    const extract = {
      left: Math.round(width * left),
      top: Math.round(height * top),
      width: Math.round(width * cropWidth),
      height: Math.round(height * cropHeight),
    };
    let image = sharp(source).extract(extract);

    // The approved erector-spinae source is red because it was originally a
    // primary reference. For a secondary role, change only warm muscle pixels
    // to Traknio blue and preserve the grey anatomical line work.
    if (layer.sourceTone !== targetTone) {
      const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const [blueR, blueG, blueB] = [45, 125, 255];
      for (let index = 0; index < data.length; index += info.channels) {
        const red = data[index];
        const green = data[index + 1];
        const blue = data[index + 2];
        if (red - green > 8 && red - blue > 8 && red > 60) {
          const luminance = Math.max(0.42, Math.min(1.18, (red + green + blue) / 360));
          data[index] = Math.round(blueR * luminance);
          data[index + 1] = Math.round(blueG * luminance);
          data[index + 2] = Math.round(blueB * luminance);
        }
      }
      // Normalise green fringe pixels after the red-to-blue pass. This is a
      // source-artifact cleanup, not an inferred anatomical mask.
      for (let index = 0; index < data.length; index += info.channels) {
        const red = data[index];
        const green = data[index + 1];
        const blue = data[index + 2];
        if (green > red * 1.15 && green > blue * 1.1 && green > 70) {
          const luminance = Math.max(0.42, Math.min(1.1, (red + green + blue) / 360));
          data[index] = Math.round(blueR * luminance);
          data[index + 1] = Math.round(blueG * luminance);
          data[index + 2] = Math.round(blueB * luminance);
        }
      }
      image = sharp(data, { raw: info });
    }

    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, await image.webp({ lossless: true }).toBuffer());
    return {
      output: output.replace(root + "\\", ""),
      source: layer.source,
      view: layer.view,
      visibleMuscles: layer.visibleMuscles,
      tone: anatomyColorByRole[targetTone],
    };
  };

  return {
    primary: await renderLayer(primaryLayer, primaryOutput, "PRIMARY"),
    secondary: await renderLayer(secondaryLayer, secondaryOutput, "SECONDARY"),
  };
}

async function main() {
  const report = [];
  for (const recipe of blockedExerciseAnatomyRecipes) {
    const outputDirectory = join(root, "public", "media", "exercises", recipe.slug);
    const result = await renderAnatomyOverlay({
      primaryLayer: recipe.primaryLayer,
      secondaryLayer: recipe.secondaryLayer,
      primaryOutput: join(outputDirectory, "anatomy-primary.webp"),
      secondaryOutput: join(outputDirectory, "anatomy-secondary.webp"),
    });
    report.push({ slug: recipe.slug, role: "primary", ...result.primary });
    report.push({ slug: recipe.slug, role: "secondary", ...result.secondary });
  }
  console.table(report);
  console.log("ANATOMY_MEDIA_STATUS=REVIEW_REQUIRED");
  console.log("HUMAN_REVIEW_STATUS=PENDING");
}

void main();
