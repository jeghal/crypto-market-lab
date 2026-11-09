import sys

file_path = r"d:\Mes_Projets_vscode\6__binance\trading-dashboard\index.html"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

target = "      </div>\n      <!-- /sidebar -->"
insertion = """
        <!-- AI Radar Card -->
        <div class="card" id="radarCard" style="animation-delay: 0.7s; padding: 0; overflow: hidden; height: 460px; border: 1px solid var(--border);">
          <iframe src="./radar/index.html" style="width: 100%; height: 100%; border: none; background: transparent; display: block;"></iframe>
        </div>
      </div>
      <!-- /sidebar -->"""

if target in content:
    new_content = content.replace(target, insertion)
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(new_content)
    print("Injected successfully.")
else:
    print("Target not found.")
