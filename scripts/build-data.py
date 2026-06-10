import json
import os
from datetime import date, datetime

import pandas as pd


FOLDER_PATH = "data_folder"
OUTPUT_PATH = os.path.join("data_private", "project-data.json")
SUPPORTED_EXTENSIONS = (".xlsx", ".xls", ".csv")
LATITUDE_COLUMN = "Latitude"
LONGITUDE_COLUMN = "Longitude"


def read_csv_with_fallback(file_path):
    last_error = None
    for encoding in ("utf-8-sig", "utf-8", "gbk"):
        try:
            return pd.read_csv(file_path, dtype={"Project ID": str}, encoding=encoding)
        except UnicodeDecodeError as error:
            last_error = error
    raise last_error


def coalesce_columns(df, target_column, source_columns):
    if target_column not in df.columns:
        df[target_column] = ""
    else:
        df[target_column] = df[target_column].fillna("").astype(str)

    for source_column in source_columns:
        if source_column not in df.columns or source_column == target_column:
            continue

        target_values = df[target_column].fillna("").astype(str).str.strip()
        source_values = df[source_column].fillna("").astype(str).str.strip()
        df.loc[target_values == "", target_column] = source_values[target_values == ""]


def normalize_project_columns(df):
    coalesce_columns(
        df,
        "Project Name",
        ("Project Name", "Generated Project Name", "Original Project Display Name"),
    )
    coalesce_columns(df, "Client", ("Client", "Client Name", "Original Client"))
    coalesce_columns(df, LATITUDE_COLUMN, (LATITUDE_COLUMN, "Google Latitude"))
    coalesce_columns(df, LONGITUDE_COLUMN, (LONGITUDE_COLUMN, "Google Longitude"))
    coalesce_columns(df, "Project Profile", ("Project Profile", "Job Type"))
    return df


def coordinate_score(df):
    if LATITUDE_COLUMN not in df.columns or LONGITUDE_COLUMN not in df.columns:
        return pd.Series(0, index=df.index)

    latitude = pd.to_numeric(df[LATITUDE_COLUMN], errors="coerce")
    longitude = pd.to_numeric(df[LONGITUDE_COLUMN], errors="coerce")
    return (latitude.notna() & longitude.notna()).astype(int)


def json_value(value):
    if pd.isna(value):
        return ""
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return str(value).strip()


def load_and_combine_data(folder):
    if not os.path.exists(folder):
        raise FileNotFoundError(f"Folder path '{folder}' was not found.")

    file_names = [
        name for name in sorted(os.listdir(folder)) if name.lower().endswith(SUPPORTED_EXTENSIONS)
    ]
    if not file_names:
        raise FileNotFoundError(f"No Excel/CSV files were found in '{folder}'.")

    frames = []
    for file_name in file_names:
        file_path = os.path.join(folder, file_name)
        if file_name.lower().endswith(".csv"):
            df = read_csv_with_fallback(file_path)
        else:
            df = pd.read_excel(file_path, dtype={"Project ID": str})
        df["Source File"] = file_name
        frames.append(df)

    combined_df = pd.concat(frames, ignore_index=True)
    combined_df.columns = combined_df.columns.str.strip()
    combined_df = normalize_project_columns(combined_df)

    if "Project ID" in combined_df.columns:
        combined_df["Project ID"] = combined_df["Project ID"].fillna("").astype(str).str.strip()
        combined_df["_coordinate_score"] = coordinate_score(combined_df)
        combined_df = (
            combined_df.sort_values("_coordinate_score", kind="stable")
            .drop_duplicates(subset=["Project ID"], keep="last")
            .drop(columns=["_coordinate_score"])
        )

    records = [
        {column: json_value(value) for column, value in row.items()}
        for row in combined_df.to_dict(orient="records")
    ]
    return file_names, records


def main():
    file_names, records = load_and_combine_data(FOLDER_PATH)
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    payload = {
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "sourceFolder": FOLDER_PATH,
        "sourceFiles": file_names,
        "recordCount": len(records),
        "records": records,
    }
    with open(OUTPUT_PATH, "w", encoding="utf-8") as output_file:
        json.dump(payload, output_file, ensure_ascii=False, indent=2)
        output_file.write("\n")
    print(f"Wrote {len(records)} records to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
