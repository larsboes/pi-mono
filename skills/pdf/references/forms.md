# PDF Form Filling

**Complete these steps in order. Do not skip ahead.**

## Step 1: Detect Form Type

Check if the PDF has fillable form fields:
```bash
python scripts/check_fillable_fields <file.pdf>
```

- **Fillable** → follow "Fillable Fields" below
- **Non-fillable** → follow "Non-Fillable Fields" below

---

## Fillable Fields

### 1. Extract field info
```bash
python scripts/extract_form_field_info.py <input.pdf> field_info.json
```

Output format per field:
- `field_id`, `page`, `rect`, `type` (text/checkbox/radio_group/choice)
- Checkboxes: `checked_value`, `unchecked_value`
- Radio groups: `radio_options[].value`
- Choice fields: `choice_options[].value`, `choice_options[].text`

### 2. Visual analysis
```bash
python scripts/convert_pdf_to_images.py <file.pdf> <output_dir>
```
Analyze images to determine purpose of each field. Map bounding box PDF coordinates to image coordinates.

### 3. Create field_values.json
```json
[
  { "field_id": "last_name", "description": "Last name", "page": 1, "value": "Simpson" },
  { "field_id": "Checkbox12", "description": "18+ checkbox", "page": 1, "value": "/On" }
]
```
Use `checked_value` for checkboxes, `radio_options[].value` for radios.

### 4. Fill
```bash
python scripts/fill_fillable_fields.py <input.pdf> field_values.json <output.pdf>
```

---

## Non-Fillable Fields

### Approach A: Structure-Based (Preferred)

#### 1. Extract structure
```bash
python scripts/extract_form_structure.py <input.pdf> form_structure.json
```
Extracts labels, lines, checkboxes with exact PDF coordinates.

#### 2. Analyze structure
- **Label groups**: Adjacent text elements forming one label
- **Row structure**: Labels with similar `top` = same row
- **Field columns**: Entry areas start after label ends (x0 = label.x1 + gap)
- **Checkboxes**: Use coordinates directly from structure

Coordinate system: y=0 at TOP of page, increases downward.

#### 3. Create fields.json
```json
{
  "pages": [{"page_number": 1, "pdf_width": 612, "pdf_height": 792}],
  "form_fields": [
    {
      "page_number": 1,
      "description": "Last name",
      "field_label": "Last Name",
      "label_bounding_box": [43, 63, 87, 73],
      "entry_bounding_box": [92, 63, 260, 79],
      "entry_text": {"text": "Smith", "font_size": 10}
    }
  ]
}
```
Use `pdf_width`/`pdf_height` to signal PDF coordinates.

### Approach B: Visual Estimation (Fallback for scanned PDFs)

#### 1. Convert to images
```bash
python scripts/convert_pdf_to_images.py <input.pdf> <images_dir>
```

#### 2. Identify fields — get rough pixel estimates

#### 3. Zoom refinement (critical for accuracy)
```bash
magick <page_image> -crop <width>x<height>+<x>+<y> +repage <crop.png>
```
Convert crop coordinates back: `full_x = crop_x + offset_x`

#### 4. Create fields.json with `image_width`/`image_height`

### Hybrid: Structure + Visual

Use structure for detected fields, visual for missing ones. Convert image coords to PDF coords:
```
pdf_x = image_x * (pdf_width / image_width)
pdf_y = image_y * (pdf_height / image_height)
```

### Validate & Fill
```bash
python scripts/check_bounding_boxes.py fields.json     # validate first
python scripts/fill_pdf_form_with_annotations.py <input.pdf> fields.json <output.pdf>
python scripts/convert_pdf_to_images.py <output.pdf> <verify_dir>  # verify
```
