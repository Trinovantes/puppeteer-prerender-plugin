print-%: ; @echo $*=$($*)

export DOCKER_BUILDKIT          := 1
export COMPOSE_DOCKER_CLI_BUILD := 1

# -----------------------------------------------------------------------------
# Vars
# -----------------------------------------------------------------------------

dockerfile = Dockerfile
container = puppeteer-prerender-plugin
image = ghcr.io/trinovantes/$(container)

# -----------------------------------------------------------------------------
# Commands
# -----------------------------------------------------------------------------

.PHONY: \
	build \
	all \
	pull \
	push \
	clean

all: build

build:
	docker build \
		--file $(dockerfile) \
		--tag $(image) \
		--progress=plain \
		.

pull:
	docker pull $(image) --quiet

push:
	docker push $(image) --quiet

clean:
	rm -rf ./dist
	docker container prune -f
	docker image prune -f
