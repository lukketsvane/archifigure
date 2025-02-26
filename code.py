import os
def main():
    output_file = "copy-code.txt"
    with open(output_file, "w", encoding="utf-8") as out_file:
        for root_dir, dirs, files in os.walk("."):
            for file in files:
                if file.endswith(".tsx"):
                    file_path = os.path.join(root_dir, file)
                    relative_path = os.path.relpath(file_path, ".")
                    out_file.write(f"File: {relative_path}\n{'=' * 80}\n")
                    try:
                        with open(file_path, "r", encoding="utf-8") as tsx_file:
                            out_file.write(tsx_file.read())
                    except Exception as e:
                        out_file.write(f"Error reading file: {e}")
                    out_file.write(f"\n{'-' * 80}\n")
if __name__ == "__main__":
    main()
