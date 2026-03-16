from __future__ import annotations

import threading
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

import cv2


VIDEO_EXTS = {".mp4", ".avi", ".mov", ".mkv", ".wmv", ".m4v", ".mpeg", ".mpg"}
IMAGE_ENCODERS = {
    "png": (".png", [int(cv2.IMWRITE_PNG_COMPRESSION), 3]),
}
CAP_PROP_SAR_NUM = getattr(cv2, "CAP_PROP_SAR_NUM", None)
CAP_PROP_SAR_DEN = getattr(cv2, "CAP_PROP_SAR_DEN", None)


class VideoSliceApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("NPUST VideoSlice Tool")
        self.root.geometry("560x500")
        self.root.minsize(520, 460)

        self.single_video_path = tk.StringVar()
        self.batch_folder_path = tk.StringVar()
        self.output_folder_path = tk.StringVar()
        self.fps_var = tk.StringVar(value="30")
        self.images_per_second_var = tk.StringVar(value="1")
        self.progress_var = tk.DoubleVar(value=0)
        self.status_var = tk.StringVar(value="Ready")
        self.is_running = False

        self._build_ui()

    def _build_ui(self) -> None:
        main = ttk.Frame(self.root, padding=12)
        main.pack(fill="both", expand=True)

        style = ttk.Style()
        style.configure("Large.TButton", padding=(18, 14), font=("Microsoft JhengHei UI", 11, "bold"))

        ttk.Label(
            main,
            text="Video Slice Tool",
            font=("Microsoft JhengHei UI", 16, "bold"),
        ).pack(anchor="w", pady=(0, 10))

        path_frame = ttk.LabelFrame(main, text="Input / Output", padding=10)
        path_frame.pack(fill="x", pady=(0, 10))
        input_buttons = ttk.Frame(path_frame)
        input_buttons.pack(fill="x", pady=(0, 10))
        ttk.Button(
            input_buttons,
            text="Single File",
            command=self.choose_single_video,
            style="Large.TButton",
        ).pack(side="left", fill="x", expand=True)
        ttk.Button(
            input_buttons,
            text="Folder",
            command=self.choose_batch_folder,
            style="Large.TButton",
        ).pack(side="left", fill="x", expand=True, padx=(10, 0))
        ttk.Button(
            path_frame,
            text="Image Output",
            command=self.choose_output_folder,
            style="Large.TButton",
        ).pack(fill="x")

        settings_frame = ttk.LabelFrame(main, text="Slice Settings", padding=10)
        settings_frame.pack(fill="x", pady=(0, 10))

        ttk.Label(settings_frame, text="Detected FPS").grid(row=0, column=0, sticky="w", padx=(0, 8), pady=6)
        ttk.Entry(settings_frame, textvariable=self.fps_var, state="readonly", width=14).grid(
            row=0, column=1, sticky="w", pady=6
        )

        ttk.Label(settings_frame, text="Images Per Second").grid(row=1, column=0, sticky="w", padx=(0, 8), pady=6)
        ttk.Entry(settings_frame, textvariable=self.images_per_second_var, width=10).grid(
            row=1, column=1, sticky="w", pady=6
        )
        ttk.Label(settings_frame, text="Output Format").grid(row=2, column=0, sticky="w", padx=(0, 8), pady=6)
        ttk.Label(settings_frame, text="PNG (fixed)").grid(row=2, column=1, sticky="w", pady=6)

        action_frame = ttk.Frame(main)
        action_frame.pack(fill="x", pady=(0, 10))

        self.start_btn = ttk.Button(action_frame, text="Start", command=self.start_processing, style="Large.TButton")
        self.start_btn.pack(fill="x")

        ttk.Progressbar(
            action_frame,
            variable=self.progress_var,
            maximum=100,
            length=300,
            mode="determinate",
        ).pack(fill="x", pady=(10, 6))

        ttk.Label(action_frame, textvariable=self.status_var).pack(anchor="e")

        log_frame = ttk.LabelFrame(main, text="Log", padding=10)
        log_frame.pack(fill="both", expand=True)

        self.log_text = tk.Text(log_frame, wrap="word", height=12, font=("Consolas", 10))
        self.log_text.pack(side="left", fill="both", expand=True)

        scroll = ttk.Scrollbar(log_frame, orient="vertical", command=self.log_text.yview)
        scroll.pack(side="right", fill="y")
        self.log_text.configure(yscrollcommand=scroll.set)

        self.log("Tool ready.")

    def log(self, message: str) -> None:
        self.log_text.insert("end", message + "\n")
        self.log_text.see("end")
        self.root.update_idletasks()

    def set_status(self, text: str) -> None:
        self.status_var.set(text)
        self.root.update_idletasks()

    def choose_single_video(self) -> None:
        path = filedialog.askopenfilename(
            title="Select video",
            filetypes=[("Video Files", "*.mp4 *.avi *.mov *.mkv *.wmv *.m4v *.mpeg *.mpg"), ("All Files", "*.*")],
        )
        if not path:
            return
        self.single_video_path.set(path)
        self.batch_folder_path.set("")
        self.set_default_output_path(Path(path))
        fps = self.read_video_fps(path)
        self.fps_var.set(self.format_fps(fps if fps else 30.0))
        self.log(f"Selected single video: {path}")
        self.log(f"Default output folder: {self.output_folder_path.get()}")
        if fps:
            self.log(f"Detected FPS: {self.fps_var.get()}")
        else:
            self.log("Unable to detect FPS from file. Falling back to 30.")

    def choose_batch_folder(self) -> None:
        folder = filedialog.askdirectory(title="Select batch folder")
        if not folder:
            return
        self.batch_folder_path.set(folder)
        self.single_video_path.set("")
        self.set_default_output_path(Path(folder))
        videos = self.find_videos_in_folder(folder)
        self.log(f"Selected batch folder: {folder}")
        self.log(f"Found {len(videos)} video(s).")
        self.log(f"Default output folder: {self.output_folder_path.get()}")
        if videos:
            fps = self.read_video_fps(str(videos[0]))
            self.fps_var.set(self.format_fps(fps if fps else 30.0))
        else:
            self.fps_var.set("30")

    def choose_output_folder(self) -> None:
        folder = filedialog.askdirectory(title="Select output folder")
        if not folder:
            return
        self.output_folder_path.set(folder)
        self.log(f"Selected output folder: {folder}")

    def set_default_output_path(self, input_path: Path) -> None:
        if input_path.is_file():
            default_output = input_path.parent / input_path.stem
        else:
            default_output = input_path.parent / f"{input_path.name}_png"
        self.output_folder_path.set(str(default_output))

    def format_fps(self, fps: float) -> str:
        return f"{fps:.3f}".rstrip("0").rstrip(".")

    def read_video_fps(self, path: str) -> float | None:
        cap = cv2.VideoCapture(path)
        if not cap.isOpened():
            return None
        fps = cap.get(cv2.CAP_PROP_FPS)
        cap.release()
        if fps is None or fps <= 0:
            return None
        return float(fps)

    def find_videos_in_folder(self, folder: str) -> list[Path]:
        folder_path = Path(folder)
        if not folder_path.exists():
            return []
        videos = [path for path in folder_path.iterdir() if path.is_file() and path.suffix.lower() in VIDEO_EXTS]
        videos.sort()
        return videos

    def validate_inputs(self) -> dict | None:
        single_path = self.single_video_path.get().strip()
        batch_path = self.batch_folder_path.get().strip()
        output_path = self.output_folder_path.get().strip()

        if not single_path and not batch_path:
            messagebox.showerror("Error", "Please choose a single video or a batch folder.")
            return None
        if single_path and batch_path:
            messagebox.showerror("Error", "Please choose either a single video or a batch folder, not both.")
            return None
        if single_path and not Path(single_path).is_file():
            messagebox.showerror("Error", f"Video file does not exist:\n{single_path}")
            return None
        if batch_path and not Path(batch_path).is_dir():
            messagebox.showerror("Error", f"Batch folder does not exist:\n{batch_path}")
            return None
        if not output_path:
            messagebox.showerror("Error", "Please choose an output folder.")
            return None

        output_dir = Path(output_path)
        try:
            output_dir.mkdir(parents=True, exist_ok=True)
        except OSError as error:
            messagebox.showerror("Error", f"Cannot create output folder:\n{output_path}\n\n{error}")
            return None

        try:
            n_per_sec = float(self.images_per_second_var.get().strip())
            if n_per_sec <= 0:
                raise ValueError
        except ValueError:
            messagebox.showerror("Error", "Images per second must be a number greater than 0.")
            return None

        return {
            "single_path": single_path,
            "batch_path": batch_path,
            "output_path": output_path,
            "n_per_sec": n_per_sec,
            "fmt": "png",
        }

    def start_processing(self) -> None:
        if self.is_running:
            return

        config = self.validate_inputs()
        if config is None:
            return

        self.is_running = True
        self.start_btn.config(state="disabled")
        self.progress_var.set(0)
        self.set_status("Processing")
        self.log("Processing started.")

        worker = threading.Thread(target=self.process_videos_thread, args=(config,), daemon=True)
        worker.start()

    def finish_processing(self) -> None:
        self.is_running = False
        self.start_btn.config(state="normal")
        self.set_status("Done")

    def process_videos_thread(self, config: dict) -> None:
        processed_videos = 0
        total_saved_images = 0
        try:
            if config["single_path"]:
                videos = [Path(config["single_path"])]
            else:
                videos = self.find_videos_in_folder(config["batch_path"])

            if not videos:
                self.root.after(0, lambda: messagebox.showerror("Error", "No video files were found."))
                self.root.after(0, self.finish_processing)
                return

            total = len(videos)
            self.root.after(0, lambda: self.log(f"Found {total} video(s) to process."))

            for idx, video_path in enumerate(videos, start=1):
                progress = ((idx - 1) / total) * 100
                self.root.after(0, lambda value=progress: self.progress_var.set(value))
                self.root.after(0, lambda text=f"Processing {idx}/{total}": self.set_status(text))
                saved_count = self.process_single_video(
                    video_path=video_path,
                    output_root=Path(config["output_path"]),
                    n_per_sec=config["n_per_sec"],
                    image_ext=config["fmt"],
                    use_subfolder=not bool(config["single_path"]),
                )
                processed_videos += 1
                total_saved_images += saved_count

            self.root.after(0, lambda: self.progress_var.set(100))
            self.root.after(0, lambda: self.log("All videos finished."))
            self.root.after(
                0,
                lambda: messagebox.showinfo(
                    "Slice Result",
                    "Slice completed successfully.\n\n"
                    f"Processed videos: {processed_videos}\n"
                    f"Output images: {total_saved_images}",
                ),
            )
            self.root.after(0, self.finish_processing)
        except Exception as error:
            self.root.after(0, lambda: self.log(f"Error: {error}"))
            self.root.after(
                0,
                lambda: messagebox.showerror(
                    "Slice Result",
                    "Slice failed.\n\n"
                    f"Processed videos: {processed_videos}\n"
                    f"Output images: {total_saved_images}\n\n{error}",
                ),
            )
            self.root.after(0, self.finish_processing)

    def save_frame(self, out_path: Path, frame, image_ext: str) -> None:
        suffix, encode_args = IMAGE_ENCODERS[image_ext]
        success, encoded = cv2.imencode(suffix, frame, encode_args)
        if not success:
            raise RuntimeError(f"OpenCV failed to encode frame as {image_ext.upper()}.")
        try:
            out_path.write_bytes(encoded.tobytes())
        except OSError as error:
            raise RuntimeError(f"Failed to write image file:\n{out_path}\n\n{error}") from error

    def get_sample_aspect_ratio(self, cap: cv2.VideoCapture) -> tuple[int, int]:
        if CAP_PROP_SAR_NUM is None or CAP_PROP_SAR_DEN is None:
            return (1, 1)
        sar_num = int(cap.get(CAP_PROP_SAR_NUM) or 0)
        sar_den = int(cap.get(CAP_PROP_SAR_DEN) or 0)
        if sar_num <= 0 or sar_den <= 0:
            return (1, 1)
        return (sar_num, sar_den)

    def correct_frame_aspect_ratio(self, frame, sar_num: int, sar_den: int):
        if sar_num <= 0 or sar_den <= 0 or sar_num == sar_den:
            return frame
        height, width = frame.shape[:2]
        target_width = max(1, int(round(width * sar_num / sar_den)))
        if target_width == width:
            return frame
        interpolation = cv2.INTER_CUBIC if target_width > width else cv2.INTER_AREA
        return cv2.resize(frame, (target_width, height), interpolation=interpolation)

    def process_single_video(
        self,
        video_path: Path,
        output_root: Path,
        n_per_sec: float,
        image_ext: str,
        use_subfolder: bool = True,
    ) -> int:
        self.root.after(0, lambda: self.log(f"Processing video: {video_path}"))

        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            raise RuntimeError(f"Cannot open video:\n{video_path}")

        fps = cap.get(cv2.CAP_PROP_FPS)
        if fps is None or fps <= 0:
            fps = 30.0

        frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        sar_num, sar_den = self.get_sample_aspect_ratio(cap)
        display_width = max(1, int(round(frame_width * sar_num / sar_den))) if frame_width > 0 else 0

        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        duration = frame_count / fps if fps > 0 else 0.0
        self.root.after(
            0,
            lambda: self.log(
                f"Video info | FPS: {fps:.3f} | Frames: {frame_count} | Stored: {frame_width}x{frame_height} | "
                f"SAR: {sar_num}:{sar_den} | Display: {display_width}x{frame_height} | Duration: {duration:.2f}s"
            ),
        )

        video_output_dir = output_root / video_path.stem if use_subfolder else output_root
        video_output_dir.mkdir(parents=True, exist_ok=True)

        interval_sec = 1.0 / n_per_sec
        next_capture_time = 0.0
        saved_count = 0
        frame_index = 0
        read_count = 0

        while True:
            ok, frame = cap.read()
            if not ok:
                break

            read_count += 1
            current_time = frame_index / fps if fps > 0 else 0.0
            should_capture = current_time + 1e-9 >= next_capture_time

            if should_capture:
                out_path = video_output_dir / f"{video_path.stem}_{saved_count + 1:06d}.{image_ext}"
                corrected_frame = self.correct_frame_aspect_ratio(frame, sar_num, sar_den)
                self.save_frame(out_path, corrected_frame, image_ext)
                saved_count += 1
                next_capture_time += interval_sec

            frame_index += 1

        cap.release()

        if read_count == 0:
            raise RuntimeError(
                "The video was opened but no frames could be read.\n"
                f"Video: {video_path}\n"
                "This usually means the codec is unsupported by your current OpenCV build."
            )
        if saved_count == 0:
            raise RuntimeError(
                "No images were written for this video.\n"
                f"Video: {video_path}\n"
                f"Output folder: {video_output_dir}"
            )

        detected_fps_text = self.format_fps(float(fps))
        self.root.after(0, lambda: self.fps_var.set(detected_fps_text))
        self.root.after(
            0,
            lambda: self.log(
                f"Finished: {video_path.name} | Read {read_count} frames | Saved {saved_count} images -> {video_output_dir}"
            ),
        )
        return saved_count


def main() -> None:
    root = tk.Tk()
    try:
        root.iconbitmap(default="")
    except Exception:
        pass
    VideoSliceApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
