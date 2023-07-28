# Load Testing Text Generation Inference on different platforms

We are using [k6](https://k6.io/) to run load testing on different platforms.


## Run test

```bash
k6 run sharegpt_load.js
```


### Use Environment variables

```bash
k6 run sharegpt_load.js -e HOST=https://xxx
```

## Configuration

```bash
-e HOST=https://xxx # host url
-e DO_SAMPLE=1 # do sample request
``````

## Installation

```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
``````
