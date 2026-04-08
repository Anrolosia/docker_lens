# =============================================================
#  Docker Lens - Developer Makefile
# =============================================================
#
#  Commands:
#    make help          Show this help
#    make install       Install all dev dependencies
#    make lint          Run ruff + prettier checks
#    make format        Auto-format Python + JS sources
#    make test          Run pytest (Linux/CI only)
#    make build         Build the React frontend
#    make version       Show current version
#    make bump-patch    1.0.0 -> 1.0.1  (bug fix)
#    make bump-minor    1.0.0 -> 1.1.0  (new feature)
#    make bump-major    1.0.0 -> 2.0.0  (breaking change)
#    make release       lint + build + bump-patch + tag + push
#    make release-minor lint + build + bump-minor + tag + push
#    make release-major lint + build + bump-major + tag + push

.DEFAULT_GOAL := help

MANIFEST      := custom_components/docker_lens/manifest.json
FRONTEND      := frontend
COMPONENT     := custom_components/docker_lens

# ── Helpers ──────────────────────────────────────────────────

.PHONY: help
help:
	@echo ""
	@echo "  Docker Lens -- Developer Commands"
	@echo ""
	@echo "  make install        Install Python + Node dev dependencies"
	@echo "  make lint           Check Python (ruff) + JS (prettier)"
	@echo "  make format         Auto-format all sources"
	@echo "  make test           Run pytest (Linux/CI only)"
	@echo "  make build          Build React frontend -> dist/"
	@echo ""
	@echo "  make version        Show current version"
	@echo "  make bump-patch     x.y.Z+1  -- bug fix"
	@echo "  make bump-minor     x.Y+1.0  -- new feature"
	@echo "  make bump-major     X+1.0.0  -- breaking change"
	@echo ""
	@echo "  make release        lint -> build -> bump-patch -> tag -> push"
	@echo "  make release-minor  lint -> build -> bump-minor -> tag -> push"
	@echo "  make release-major  lint -> build -> bump-major -> tag -> push"
	@echo ""

# ── Dependencies ─────────────────────────────────────────────

.PHONY: install
install:
	@echo "--- Installing Python dependencies"
	pip install -r requirements_test.txt
	pip install ruff
	@echo "--- Installing Node dependencies"
	cd $(FRONTEND) && npm install
	@echo "Done."

# ── Lint ─────────────────────────────────────────────────────

.PHONY: lint
lint:
	@echo "--- ruff check"
	ruff check $(COMPONENT)
	@echo "--- ruff format check"
	ruff format --check $(COMPONENT)
	@echo "--- prettier check"
	cd $(FRONTEND) && npx prettier --check --config .prettierrc "src/**/*.{js,jsx,ts,tsx,json,css}"
	@echo "Lint passed."

# ── Format ───────────────────────────────────────────────────

.PHONY: format
format:
	@echo "--- ruff format"
	ruff format $(COMPONENT)
	ruff check --fix $(COMPONENT)
	@echo "--- prettier write"
	cd $(FRONTEND) && npx prettier --write --config .prettierrc "src/**/*.{js,jsx,ts,tsx,json,css}"
	@echo "Format done."

# ── Tests ────────────────────────────────────────────────────

.PHONY: test
test:
	@echo "--- pytest"
	pytest tests/ -v --tb=short

# ── Build ────────────────────────────────────────────────────

.PHONY: build
build:
	@echo "--- Building frontend"
	cd $(FRONTEND) && npm run build
	@echo "Build done."

# ── Version ──────────────────────────────────────────────────

.PHONY: version
version:
	@python3 -c "import json; m=json.load(open('$(MANIFEST)')); print('Version: ' + m['version'])"

.PHONY: bump-patch
bump-patch:
	@python3 -c "\
import json; \
m=json.load(open('$(MANIFEST)')); \
p=list(map(int,m['version'].split('.'))); \
p[2]+=1; \
m['version']='.'.join(map(str,p)); \
json.dump(m,open('$(MANIFEST)','w'),indent=2); \
open('$(MANIFEST)','a').write('\n'); \
print('Bumped to ' + m['version'])"

.PHONY: bump-minor
bump-minor:
	@python3 -c "\
import json; \
m=json.load(open('$(MANIFEST)')); \
p=list(map(int,m['version'].split('.'))); \
p[1]+=1; p[2]=0; \
m['version']='.'.join(map(str,p)); \
json.dump(m,open('$(MANIFEST)','w'),indent=2); \
open('$(MANIFEST)','a').write('\n'); \
print('Bumped to ' + m['version'])"

.PHONY: bump-major
bump-major:
	@python3 -c "\
import json; \
m=json.load(open('$(MANIFEST)')); \
p=list(map(int,m['version'].split('.'))); \
p[0]+=1; p[1]=0; p[2]=0; \
m['version']='.'.join(map(str,p)); \
json.dump(m,open('$(MANIFEST)','w'),indent=2); \
open('$(MANIFEST)','a').write('\n'); \
print('Bumped to ' + m['version'])"

# ── Release ──────────────────────────────────────────────────

.PHONY: release
release: lint build bump-patch
	$(eval VER := $(shell python3 -c "import json; print(json.load(open('$(MANIFEST)'))['version'])"))
	@echo "--- Releasing v$(VER)"
	git add $(MANIFEST) $(COMPONENT)/frontend/dist/
	git commit -m "chore: release v$(VER)"
	git tag -a "v$(VER)" -m "Release v$(VER)"
	git push && git push --tags
	@echo "Released v$(VER)"

.PHONY: release-minor
release-minor: lint build bump-minor
	$(eval VER := $(shell python3 -c "import json; print(json.load(open('$(MANIFEST)'))['version'])"))
	@echo "--- Releasing v$(VER)"
	git add $(MANIFEST) $(COMPONENT)/frontend/dist/
	git commit -m "chore: release v$(VER)"
	git tag -a "v$(VER)" -m "Release v$(VER)"
	git push && git push --tags
	@echo "Released v$(VER)"

.PHONY: release-major
release-major: lint build bump-major
	$(eval VER := $(shell python3 -c "import json; print(json.load(open('$(MANIFEST)'))['version'])"))
	@echo "--- Releasing v$(VER)"
	git add $(MANIFEST) $(COMPONENT)/frontend/dist/
	git commit -m "chore: release v$(VER)"
	git tag -a "v$(VER)" -m "Release v$(VER)"
	git push && git push --tags
	@echo "Released v$(VER)"