import os
import io
import pandas as pd
from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename

from config import DATA_DIR, ALLOWED_EXTENSIONS
from services.dataset_service import dataset_service

dataset_bp = Blueprint("dataset", __name__)


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


@dataset_bp.route("/dataset/upload", methods=["POST"])
def upload_dataset():
    """
    Accepts CSV file upload with configurable column mappings.
    Validates structure, cleans text, and generates summary.
    """
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded in form data."}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No file selected."}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": f"Invalid file type. Allowed: {list(ALLOWED_EXTENSIONS)}"}), 400

    filename = secure_filename(file.filename)
    save_path = os.path.join(DATA_DIR, filename)

    try:
        # Read file into memory and save
        content = file.read()
        file.seek(0)
        file.save(save_path)

        # Parse CSV
        try:
            df = pd.read_csv(io.BytesIO(content))
        except UnicodeDecodeError:
            df = pd.read_csv(io.BytesIO(content), encoding="latin-1")

        if df.empty:
            return jsonify({"error": "Uploaded CSV file is empty."}), 400

        # Read configurable column mappings from form or auto-detect
        text_col = request.form.get("text_column")
        label_col = request.form.get("label_column")
        subject_col = request.form.get("subject_column")

        # Auto-detect if not provided
        cols_lower = {c.lower(): c for c in df.columns}
        if not text_col:
            for candidate in ["text", "body", "message", "email", "content", "v2"]:
                if candidate in cols_lower:
                    text_col = cols_lower[candidate]
                    break
            if not text_col:
                text_col = df.columns[1] if len(df.columns) > 1 else df.columns[0]

        if not label_col:
            for candidate in ["label", "class", "target", "category", "type", "v1"]:
                if candidate in cols_lower:
                    label_col = cols_lower[candidate]
                    break
            if not label_col:
                label_col = df.columns[0]

        if not subject_col:
            for candidate in ["subject", "title"]:
                if candidate in cols_lower and cols_lower[candidate] != text_col:
                    subject_col = cols_lower[candidate]
                    break

        summary = dataset_service.set_dataset(
            df=df,
            filename=filename,
            text_col=text_col,
            label_col=label_col,
            subject_col=subject_col
        )

        return jsonify({
            "status": "success",
            "message": f"Dataset '{filename}' uploaded and preprocessed successfully.",
            "summary": summary
        })

    except Exception as e:
        return jsonify({"error": f"Error processing dataset: {str(e)}"}), 500


@dataset_bp.route("/dataset/summary", methods=["GET"])
def get_dataset_summary():
    """Returns summary of currently loaded active dataset."""
    summary = dataset_service.get_summary()
    if not summary:
        return jsonify({
            "is_loaded": False,
            "message": "No dataset currently loaded. Upload a CSV or load the benchmark dataset."
        })
    return jsonify({
        "is_loaded": True,
        "summary": summary
    })


@dataset_bp.route("/dataset/load-sample", methods=["POST"])
def load_sample_dataset():
    """Loads the bundled benchmark email security dataset."""
    try:
        summary = dataset_service.load_benchmark_dataset()
        return jsonify({
            "status": "success",
            "message": "Benchmark email dataset loaded and validated successfully.",
            "summary": summary
        })
    except Exception as e:
        return jsonify({"error": f"Failed to load sample dataset: {str(e)}"}), 500


@dataset_bp.route("/dataset/remap", methods=["POST"])
def remap_columns():
    """Allows user to change column mappings on the loaded raw dataset without re-uploading."""
    raw_df = dataset_service.get_raw_dataset()
    if raw_df is None:
        return jsonify({"error": "No dataset currently loaded to remap."}), 400

    data = request.get_json() or {}
    text_col = data.get("text_column")
    label_col = data.get("label_column")
    subject_col = data.get("subject_column")

    if not text_col or text_col not in raw_df.columns:
        return jsonify({"error": f"Invalid text column: {text_col}"}), 400
    if not label_col or label_col not in raw_df.columns:
        return jsonify({"error": f"Invalid label column: {label_col}"}), 400

    try:
        summary = dataset_service.set_dataset(
            df=raw_df,
            filename=dataset_service._filename or "dataset.csv",
            text_col=text_col,
            label_col=label_col,
            subject_col=subject_col if (subject_col and subject_col in raw_df.columns) else None
        )
        return jsonify({
            "status": "success",
            "message": "Column mappings updated and dataset re-processed.",
            "summary": summary
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500
