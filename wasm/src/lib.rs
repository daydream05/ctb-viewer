use common::{
    container::rle::decode_into,
    serde::SliceDeserializer,
};
use ctb_format::{File as ParsedFile, Layer, LayerDecoder, PreviewImage};
use serde::Serialize;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct CtbFile {
    inner: ParsedFile,
}

#[wasm_bindgen]
impl CtbFile {
    pub fn parse(data: &[u8]) -> Result<CtbFile, JsError> {
        let mut deserializer = SliceDeserializer::new(data);
        let inner = ParsedFile::deserialize(&mut deserializer)
            .map_err(|error| JsError::new(&error.to_string()))?;

        Ok(Self { inner })
    }

    pub fn metadata(&self) -> String {
        serde_json::to_string(&self.metadata_json()).unwrap_or_else(|_| "{}".to_owned())
    }

    pub fn large_preview(&self) -> Vec<u8> {
        preview_to_rgba(&self.inner.large_preview)
    }

    pub fn small_preview(&self) -> Vec<u8> {
        preview_to_rgba(&self.inner.small_preview)
    }

    pub fn preview_size(&self) -> Vec<u32> {
        preview_size(&self.inner.large_preview).to_vec()
    }

    pub fn layer_count(&self) -> u32 {
        self.inner.layers.len() as u32
    }

    pub fn decode_layer(&self, index: u32) -> Vec<u8> {
        self.inner
            .layers
            .get(index as usize)
            .map(|layer| decode_layer_to_rgba(layer, self.inner.resolution.x, self.inner.resolution.y))
            .unwrap_or_default()
    }

    pub fn layer_info(&self, index: u32) -> String {
        let Some(layer) = self.inner.layers.get(index as usize) else {
            return "{}".to_owned();
        };

        serde_json::to_string(&LayerInfo {
            index,
            z_pos_mm: layer.position_z.raw(),
            exposure_time_s: layer.exposure_time.raw(),
            light_off_delay_s: layer.light_off_delay.raw(),
        })
        .unwrap_or_else(|_| "{}".to_owned())
    }
}

impl CtbFile {
    fn metadata_json(&self) -> Metadata {
        let printer_name = if self.inner.machine_name.trim().is_empty() {
            self.inner.resin_parameters.machine_name.clone()
        } else {
            self.inner.machine_name.clone()
        };

        Metadata {
            format_version: 5,
            printer: PrinterMetadata {
                name: printer_name,
                resolution: [self.inner.resolution.x, self.inner.resolution.y],
                size_mm: [self.inner.size.x.raw(), self.inner.size.y.raw(), self.inner.size.z.raw()],
            },
            layers: LayerMetadata {
                count: self.layer_count(),
                height_mm: self.inner.layer_height.raw(),
                total_height_mm: self.inner.total_height.raw(),
            },
            exposure: ExposureMetadata {
                normal_time_s: self.inner.exposure_time.raw(),
                bottom_time_s: self.inner.bottom_exposure_time.raw(),
                bottom_layers: self.inner.bottom_layer_count,
                light_off_delay_s: self.inner.light_off_delay.raw(),
                lift_height_mm: self.inner.lift_height.raw(),
                lift_speed_mm_min: self.inner.lift_speed.raw(),
                retract_speed_mm_min: self.inner.retract_speed.raw(),
            },
            estimates: EstimateMetadata {
                print_time_s: self.inner.print_time,
                print_time_formatted: format_duration(self.inner.print_time),
                material_ml: self.inner.material_milliliters,
                material_grams: self.inner.material_grams,
                material_cost: self.inner.material_cost,
            },
            resin: ResinMetadata {
                name: self.inner.resin_parameters.resin_name.clone(),
                r#type: self.inner.resin_parameters.resin_type.clone(),
                cost: 0.0,
                density: self.inner.resin_parameters.resin_density,
            },
            previews: PreviewMetadata {
                large_size: preview_size(&self.inner.large_preview),
                small_size: preview_size(&self.inner.small_preview),
            },
        }
    }
}

fn preview_to_rgba(preview: &PreviewImage) -> Vec<u8> {
    let mut out = Vec::with_capacity(preview.inner_data().len() * 4);
    for pixel in preview.inner_data() {
        out.extend_from_slice(&[pixel.x, pixel.y, pixel.z, 255]);
    }
    out
}

fn preview_size(preview: &PreviewImage) -> [u32; 2] {
    let size = preview.size();
    [size.x, size.y]
}

fn decode_layer_to_rgba(layer: &Layer, width: u32, height: u32) -> Vec<u8> {
    let pixel_count = width as usize * height as usize;
    let mut grayscale = vec![0; pixel_count];
    decode_into(LayerDecoder::new(&layer.data), &mut grayscale);

    let mut out = Vec::with_capacity(pixel_count * 4);
    for value in grayscale {
        out.extend_from_slice(&[value, value, value, 255]);
    }
    out
}

fn format_duration(seconds: u32) -> String {
    let hours = seconds / 3600;
    let minutes = (seconds % 3600) / 60;
    let secs = seconds % 60;

    if hours > 0 {
        format!("{hours}h {minutes}m")
    } else if minutes > 0 {
        format!("{minutes}m {secs}s")
    } else {
        format!("{secs}s")
    }
}

#[derive(Serialize)]
struct Metadata {
    format_version: u32,
    printer: PrinterMetadata,
    layers: LayerMetadata,
    exposure: ExposureMetadata,
    estimates: EstimateMetadata,
    resin: ResinMetadata,
    previews: PreviewMetadata,
}

#[derive(Serialize)]
struct PrinterMetadata {
    name: String,
    resolution: [u32; 2],
    size_mm: [f32; 3],
}

#[derive(Serialize)]
struct LayerMetadata {
    count: u32,
    height_mm: f32,
    total_height_mm: f32,
}

#[derive(Serialize)]
struct ExposureMetadata {
    normal_time_s: f32,
    bottom_time_s: f32,
    bottom_layers: u32,
    light_off_delay_s: f32,
    lift_height_mm: f32,
    lift_speed_mm_min: f32,
    retract_speed_mm_min: f32,
}

#[derive(Serialize)]
struct EstimateMetadata {
    print_time_s: u32,
    print_time_formatted: String,
    material_ml: f32,
    material_grams: f32,
    material_cost: f32,
}

#[derive(Serialize)]
struct ResinMetadata {
    name: String,
    r#type: String,
    cost: f32,
    density: f32,
}

#[derive(Serialize)]
struct PreviewMetadata {
    large_size: [u32; 2],
    small_size: [u32; 2],
}

#[derive(Serialize)]
struct LayerInfo {
    index: u32,
    z_pos_mm: f32,
    exposure_time_s: f32,
    light_off_delay_s: f32,
}

#[cfg(test)]
mod tests {
    use std::fs;

    use serde_json::Value;

    use super::CtbFile;

    const SAMPLE_FILE: &str = "/tmp/chibi-test.ctb";

    fn sample_bytes() -> Vec<u8> {
        fs::read(SAMPLE_FILE).expect("sample CTB should exist at /tmp/chibi-test.ctb")
    }

    fn parse_sample() -> CtbFile {
        CtbFile::parse(&sample_bytes()).expect("sample CTB should parse")
    }

    #[test]
    fn parses_sample_ctb_and_emits_metadata_json() {
        let file = parse_sample();
        let metadata: Value =
            serde_json::from_str(&file.metadata()).expect("metadata should be valid JSON");

        assert_eq!(metadata["format_version"].as_u64(), Some(5));
        assert!(metadata["printer"]["name"].as_str().is_some());
        assert_eq!(metadata["printer"]["resolution"].as_array().map(Vec::len), Some(2));
        assert!(metadata["layers"]["count"].as_u64().unwrap_or_default() > 0);
        assert_eq!(
            metadata["layers"]["count"].as_u64().unwrap_or_default() as u32,
            file.layer_count()
        );
        assert!(metadata["estimates"]["print_time_s"].is_number());
        assert!(metadata["estimates"]["print_time_formatted"].as_str().is_some());
    }

    #[test]
    fn decodes_preview_and_first_layer_pixels() {
        let file = parse_sample();
        let metadata: Value =
            serde_json::from_str(&file.metadata()).expect("metadata should be valid JSON");
        let preview_size = file.preview_size();
        let large_preview = file.large_preview();
        let small_preview = file.small_preview();

        assert_eq!(preview_size.len(), 2);
        assert_eq!(
            large_preview.len() as u64,
            preview_size[0] as u64 * preview_size[1] as u64 * 4
        );
        assert!(large_preview.chunks_exact(4).all(|pixel| pixel[3] == 255));

        let small_size = metadata["previews"]["small_size"]
            .as_array()
            .expect("metadata should include small preview size");
        let small_width = small_size[0].as_u64().unwrap_or_default();
        let small_height = small_size[1].as_u64().unwrap_or_default();

        assert_eq!(small_preview.len() as u64, small_width * small_height * 4);
        assert!(small_preview.chunks_exact(4).all(|pixel| pixel[3] == 255));

        let resolution = metadata["printer"]["resolution"]
            .as_array()
            .expect("metadata should include printer resolution");
        let layer = file.decode_layer(file.layer_count() / 2);
        let width = resolution[0].as_u64().unwrap_or_default();
        let height = resolution[1].as_u64().unwrap_or_default();

        assert_eq!(layer.len() as u64, width * height * 4);
        assert!(layer.chunks_exact(4).all(|pixel| pixel[3] == 255));
        assert!(layer.chunks_exact(4).any(|pixel| pixel[0] != 0 || pixel[1] != 0 || pixel[2] != 0));
    }

    #[test]
    fn reports_first_layer_info_as_json() {
        let file = parse_sample();
        let layer_info: Value =
            serde_json::from_str(&file.layer_info(0)).expect("layer info should be valid JSON");

        assert_eq!(layer_info["index"].as_u64(), Some(0));
        assert!(layer_info["z_pos_mm"].as_f64().unwrap_or_default() > 0.0);
        assert!(layer_info["exposure_time_s"].as_f64().unwrap_or_default() > 0.0);
    }
}
