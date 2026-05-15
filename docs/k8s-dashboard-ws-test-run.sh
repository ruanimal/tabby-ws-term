# export SSL_CERT_FILE=/Users/ruan/.mitmproxy/py-certifi-combined-ca.pem
# export REQUESTS_CA_BUNDLE=/Users/ruan/.mitmproxy/py-certifi-combined-ca.pem
# export HTTPS_PROXY=http://localhost:9082
# export HTTP_PROXY=http://localhost:9082

# 从 K8s 集群获取 dashboard-admin 的 bearer token
# K8S_TOKEN=$(kubectl -s https://192.168.194.216:6443 --insecure-skip-tls-verify \
#   get secret -n kubernetes-dashboard \
#   $(kubectl -s https://192.168.194.216:6443 --insecure-skip-tls-verify \
#     get secret -n kubernetes-dashboard -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' \
#     | grep dashboard-admin) \
#   -o jsonpath='{.data.token}' | base64 -d)

# K8S_TOKEN=eyJ...

cd $(dirname "$0")

python3 docs/k8s-dashboard-ws-test.py \
  --host https://192.168.194.216 \
  --pod nginx \
  --container nginx \
  --namespace default \
  --k8s-token "$K8S_TOKEN" \
  --allow-insecure \
  --cmd 'echo hello' \
  --timeout 20
