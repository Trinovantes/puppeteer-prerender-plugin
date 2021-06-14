print-%: ; @echo $*=$($*)

export DOCKER_BUILDKIT          := 1
export COMPOSE_DOCKER_CLI_BUILD := 1

dockerfile = Dockerfile
container = puppeteer-prerender-plugin
image = ghcr.io/trinovantes/$(container)

.PHONY: \
	build \
	all \
	pull \
	push \
	clean

all: build

pull:
	docker pull $(image) --quiet

push:
	docker push $(image) --quiet

clean:
	rm -rf ./dist
	docker container prune -f
	docker image prune -f

# -----------------------------------------------------------------------------
# Commands
# -----------------------------------------------------------------------------

build:
	docker build \
		--file $(dockerfile) \
		--tag $(image) \
		--progress=plain \
		.
