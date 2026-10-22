import os
import threading
import tkinter.messagebox
import webbrowser

import pystray
from PIL import Image, ImageDraw
from waitress import create_server

os.environ["ENABLE_LOCAL_EXECUTION"] = "true"
os.environ.setdefault("FRONTEND_ORIGINS", "https://code-flow-rho-lemon.vercel.app")

from app import app

IDE_URL = "https://code-flow-rho-lemon.vercel.app/"
RUNNER_URL = "http://127.0.0.1:4000"


def create_icon():
    image = Image.new("RGBA", (64, 64), (11, 18, 32, 255))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((2, 2, 62, 62), radius=18, fill=(16, 29, 48, 255))
    draw.line(((22, 21), (12, 32), (22, 43)), fill=(94, 234, 212, 255), width=5, joint="curve")
    draw.line(((42, 21), (52, 32), (42, 43)), fill=(96, 165, 250, 255), width=5, joint="curve")
    draw.line(((27, 39), (37, 25)), fill=(88, 196, 225, 255), width=4)
    draw.ellipse((29, 29, 35, 35), fill=(252, 211, 77, 255))
    return image


def stop_runner(icon, server, server_thread):
    icon.stop()
    server.close()
    server_thread.join(timeout=5)


def main():
    try:
        server = create_server(app, host="127.0.0.1", port=4000, threads=8)
    except OSError as error:
        tkinter.messagebox.showerror(
            "CodeFlow Local Runner",
            f"Could not start the local runner on port 4000.\n\n{error}\n\n"
            "Close any other runner using this port, then try again.",
        )
        return

    server_thread = threading.Thread(target=server.run, name="CodeFlowLocalRunner", daemon=True)
    server_thread.start()

    icon = pystray.Icon(
        "CodeFlowLocalRunner",
        create_icon(),
        "CodeFlow Local Runner — listening on 127.0.0.1:4000",
        menu=pystray.Menu(
            pystray.MenuItem("Open CodeFlow", lambda: webbrowser.open(IDE_URL), default=True),
            pystray.MenuItem("Stop local runner", lambda icon, _item: stop_runner(icon, server, server_thread)),
        ),
    )
    icon.run()


if __name__ == "__main__":
    main()
