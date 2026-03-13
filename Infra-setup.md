# VM 초기 셋업 절차서: Personal Color AI Analysis

본 문서는 VirtualBox VM을 생성한 직후부터 K8s 클러스터가 정상 동작하기까지의  
**최초 1회 셋업 절차**를 단계별로 정리한 복원 가이드입니다.  
VM을 재설치하거나 클러스터를 처음부터 다시 구축할 때 이 문서만 보고 복원할 수 있도록 작성되었습니다.

> 실행 VM을 각 단계마다 명시합니다. 헷갈리지 않도록 반드시 확인하세요.

---

## 전체 작업 순서 요약

| 단계 | 작업 | 대상 VM |
|------|------|---------|
| 1 | VirtualBox VM 생성 및 어댑터 설정 | 전체 |
| 2 | Netplan — 브리지 고정 IP 설정 | 전체 |
| 3 | /etc/hosts 설정 | 전체 |
| 4 | K8s 사전 준비 (swap off, 커널 모듈, containerd 설치) | VM1, VM2, VM3 |
| 5 | kubeadm init — 마스터 노드 초기화 | VM1 |
| 6 | Flannel CNI 설치 및 enp0s8 인터페이스 고정 | VM1 |
| 7 | 워커 노드 클러스터 합류 | VM2, VM3 |
| 8 | 노드 레이블 및 VM3 Taint 설정 | VM1 |
| 9 | Helm 설치 | VM1 |
| 10 | Pod 외부 인터넷 연결 (iptables MASQUERADE) | VM1, VM2, VM3 |
| 11 | VM4 — GitLab CE 설치 | VM4 |

---

## Step 1 — VirtualBox VM 생성 및 어댑터 설정

### VM 스펙 요약

| VM | 호스트명 | RAM | CPU | 디스크 | 물리 PC |
|----|----------|-----|-----|--------|---------|
| VM1 | ubuntu-k8s-master | 6GB | 3 vCPU | 50GB | PC-A |
| VM2 | ubuntu-k8s-web | 8GB | 4 vCPU | 80GB | PC-B |
| VM3 | ubuntu-k8s-ai | 12GB | 4 vCPU | 60GB | PC-B |
| VM4 | ubuntu-k8s-gitlab | 8GB | 4 vCPU | 100GB | PC-A |

- OS: Ubuntu Server 22.04 LTS (64-bit), 전 VM 동일
- 비디오 메모리: 16MB (서버용 최소값)
- 디스크: 동적 할당 VDI

### 네트워크 어댑터 설정 (전 VM 공통)

| 어댑터 | 종류 | 설정 |
|--------|------|------|
| 어댑터1 | NAT | DHCP 자동 (외부 인터넷용) |
| 어댑터2 | 브리지 어댑터 | 고정 IP 수동 설정, 무작위 모드: 모두 허용 |

> ⚠️ **어댑터2 무작위 모드(Promiscuous Mode)를 반드시 "모두 허용"으로 설정**  
> 미설정 시 K8s Pod 간 통신 불가

---

## Step 2 — Netplan 브리지 고정 IP 설정

**대상: VM1, VM2, VM3, VM4 각각 실행**

### 설정 파일 위치

```bash
sudo nano /etc/netplan/00-installer-config.yaml
```

> ⚠️ 파일명은 환경에 따라 `01-netcfg.yaml` 등으로 다를 수 있음  
> `ls /etc/netplan/` 으로 실제 파일명 먼저 확인

### VM별 Netplan 설정

**VM1 (ubuntu-k8s-master / 192.168.10.245)**

```yaml
network:
  version: 2
  ethernets:
    enp0s3:
      dhcp4: true
    dhcp4-overrides:
        route-metric: 200
    enp0s8:
      dhcp4: no
      addresses: [192.168.10.245/24]
      routes:
        - to: default
          via: 192.168.10.1
          metric: 100
      nameservers:
        addresses: [8.8.8.8, 8.8.4.4]
```

**VM2 (ubuntu-k8s-web / 192.168.10.246)**

```yaml
network:
  version: 2
  ethernets:
    enp0s3:
      dhcp4: true
    dhcp4-overrides:
        route-metric: 200
    enp0s8:
      dhcp4: no
      addresses: [192.168.10.246/24]
      routes:
        - to: default
          via: 192.168.10.1
          metric: 100
      nameservers:
        addresses: [8.8.8.8, 8.8.4.4]
```

**VM3 (ubuntu-k8s-ai / 192.168.10.247)**

```yaml
network:
  version: 2
  ethernets:
    enp0s3:
      dhcp4: true
      dhcp4-overrides:
          route-metric: 200
      enp0s8:
        dhcp4: no
        addresses: [192.168.10.247/24]
        routes:
          - to: default
            via: 192.168.10.1
            metric: 100
        nameservers:
          addresses: [8.8.8.8, 8.8.4.4]
```

**VM4 (ubuntu-k8s-gitlab / 192.168.10.248)**

```yaml
network:
  version: 2
  ethernets:
    enp0s3:
      dhcp4: true
      dhcp4-overrides:
          route-metric: 200
      enp0s8:
        dhcp4: no
        addresses: [192.168.10.248/24]
        routes:
          - to: default
            via: 192.168.10.1
            metric: 100
        nameservers:
          addresses: [8.8.8.8, 8.8.4.4]
```

### 적용

```bash
sudo netplan apply

# 확인
ip addr show enp0s8   # 고정 IP 할당 확인
ping 192.168.10.1     # 게이트웨이 통신 확인
```

> ⚠️ `metric: 200` 설정 이유: enp0s3(NAT)이 기본 게이트웨이를 선점하지 않도록 enp0s8의 우선순위를 낮게 설정.  
> 외부 인터넷은 enp0s3(NAT)으로, 클러스터 내부 통신은 enp0s8(브리지)로 자동 분리됨.

---

## Step 3 — /etc/hosts 설정

**대상: VM1, VM2, VM3 (K8s 클러스터 노드 전체)**

```bash
sudo nano /etc/hosts
```

아래 내용 추가:

```
192.168.10.245  ubuntu-k8s-master
192.168.10.246  ubuntu-k8s-web
192.168.10.247  ubuntu-k8s-ai
192.168.10.248  ubuntu-k8s-gitlab
192.168.10.136  www.color-ai.com
```

> VM4(GitLab)에는 K8s 노드 항목만 필요에 따라 추가

---

## Step 4 — K8s 사전 준비

**대상: VM1, VM2, VM3 (VM4 제외)**

### 4-1. swap 비활성화

```bash
# 즉시 비활성화
sudo swapoff -a

# 재부팅 후에도 유지
sudo sed -i '/swap/s/^/#/' /etc/fstab

# 확인 (아무것도 안 나오면 정상)
free -h | grep Swap
```

> ⚠️ K8s 요구사항 — swap 활성화 시 kubelet 실행 불가

### 4-2. 커널 모듈 및 sysctl 설정

```bash
# 필수 커널 모듈 로드
cat <<EOF | sudo tee /etc/modules-load.d/k8s.conf
overlay
br_netfilter
EOF

sudo modprobe overlay
sudo modprobe br_netfilter

# sysctl 설정 (브리지 트래픽 iptables 통과 허용)
cat <<EOF | sudo tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF

sudo sysctl --system

# 확인
lsmod | grep br_netfilter
```

### 4-3. containerd 설치

```bash
# 필수 패키지
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg

# Docker 공식 GPG 키 추가
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# 저장소 추가
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list

sudo apt-get update
sudo apt-get install -y containerd.io
```

### 4-4. containerd 설정 (insecure registry 포함)

```bash
# 기본 설정 생성
sudo mkdir -p /etc/containerd
containerd config default | sudo tee /etc/containerd/config.toml

# SystemdCgroup 활성화 (필수)
sudo sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml

# config_path 단일 경로 설정
# ⚠️ containerd v2.2.1 신버전은 플러그인명이 io.containerd.cri.v1.images
# config_path는 단일 경로만 허용됨
sudo mkdir -p /etc/containerd/certs.d/192.168.10.248:5050

cat <<EOF | sudo tee /etc/containerd/certs.d/192.168.10.248:5050/hosts.toml
[host."http://192.168.10.248:5050"]
  capabilities = ["pull", "resolve"]
  skip_verify = true
EOF

sudo systemctl restart containerd
sudo systemctl enable containerd

# 확인
sudo systemctl status containerd
```

### 4-5. kubeadm, kubelet, kubectl 설치

```bash
sudo apt-get update
sudo apt-get install -y apt-transport-https ca-certificates curl gpg

curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.29/deb/Release.key | \
  sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg

echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] \
  https://pkgs.k8s.io/core:/stable:/v1.29/deb/ /' | \
  sudo tee /etc/apt/sources.list.d/kubernetes.list

sudo apt-get update
sudo apt-get install -y kubelet kubeadm kubectl
sudo apt-mark hold kubelet kubeadm kubectl   # 자동 업그레이드 방지

# 확인
kubeadm version
kubectl version --client
```

---

## Step 5 — kubeadm init (마스터 노드 초기화)

**대상: VM1만 실행**

```bash
sudo kubeadm init \
  --apiserver-advertise-address=192.168.10.245 \
  --pod-network-cidr=10.244.0.0/16

# kubeconfig 설정 (kubectl 사용을 위해 필수)
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config

# 확인
kubectl get nodes   # STATUS: NotReady (CNI 미설치 상태 — 정상)
```

> ⚠️ `kubeadm join` 명령어가 출력됨 → **반드시 복사해두기** (Step 7에서 사용)  
> 분실 시 재발급: `kubeadm token create --print-join-command`

---

## Step 6 — Flannel CNI 설치 및 enp0s8 고정

**대상: VM1만 실행**

```bash
# Flannel 설치
kubectl apply -f https://raw.githubusercontent.com/flannel-io/flannel/master/Documentation/kube-flannel.yml
```

### enp0s8 인터페이스 고정 (필수)

```bash
# kube-flannel DaemonSet 편집
kubectl edit daemonset kube-flannel-ds -n kube-flannel
```

`args` 섹션에 `--iface=enp0s8` 추가:

```yaml
args:
  - --ip-masq
  - --kube-subnet-mgr
  - --iface=enp0s8    # ← 추가 (브리지 인터페이스 고정)
```

```bash
# 적용 확인 (모든 flannel Pod가 Running 상태 확인)
kubectl get pods -n kube-flannel

# 노드 상태 확인 (STATUS: Ready로 변경 확인)
kubectl get nodes
```

> ⚠️ `--iface=enp0s8` 미설정 시 Flannel이 enp0s3(NAT)을 선택하여  
> Pod 간 통신이 NAT을 거치게 되어 클러스터 내부 통신 불안정

---

## Step 7 — 워커 노드 클러스터 합류

**대상: VM2, VM3 각각 실행**

```bash
# Step 5에서 복사해둔 join 명령어 실행
sudo kubeadm join 192.168.10.245:6443 \
  --token <token> \
  --discovery-token-ca-cert-hash sha256:<hash>
```

```bash
# VM1에서 확인
kubectl get nodes
# NAME                 STATUS   ROLES           AGE
# ubuntu-k8s-master   Ready    control-plane   Xm
# ubuntu-k8s-web      Ready    <none>          Xm
# ubuntu-k8s-ai       Ready    <none>          Xm
```

---

## Step 8 — 노드 레이블 및 Taint 설정

**대상: VM1에서 실행**

```bash
# 노드 레이블
kubectl label node ubuntu-k8s-web role=web
kubectl label node ubuntu-k8s-ai  role=ai

# VM3 Taint — AI 전용 노드 격리 (일반 웹 파드 배치 방지)
kubectl taint nodes ubuntu-k8s-ai dedicated=ai:NoSchedule

# 확인
kubectl describe node ubuntu-k8s-ai | grep -A5 Taints
kubectl get nodes --show-labels
```

---

## Step 9 — Helm 설치

**대상: VM1만 실행**

```bash
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# 확인
helm version
```

---

## Step 10 — Pod 외부 인터넷 연결 설정

**대상: VM1, VM2, VM3 각각 실행**

```bash
# Pod 트래픽(10.244.0.0/16)을 enp0s3(NAT)으로 마스커레이드
sudo iptables -t nat -A POSTROUTING -s 10.244.0.0/16 ! -d 10.244.0.0/16 -o enp0s3 -j MASQUERADE

# 재부팅 후에도 유지
sudo apt-get install -y iptables-persistent
sudo netfilter-persistent save

# 확인
sudo iptables -t nat -L POSTROUTING -n -v | grep MASQUERADE
```

> ⚠️ 이 설정 없이는 Pod에서 외부 apt-get, pip install 등 인터넷 연결 불가  
> 원인: Pod 트래픽이 enp0s8(브리지)로 나가다가 공유기에서 차단됨

---

## Step 11 — VM4 GitLab CE 설치

**대상: VM4만 실행**

```bash
# 필수 패키지
sudo apt-get update
sudo apt-get install -y curl openssh-server ca-certificates tzdata perl

# GitLab 저장소 추가 및 설치
curl https://packages.gitlab.com/install/repositories/gitlab/gitlab-ce/script.deb.sh | sudo bash
sudo EXTERNAL_URL="http://192.168.10.248" apt-get install -y gitlab-ce

# 설치 완료 후 초기 비밀번호 확인
sudo cat /etc/gitlab/initial_root_password
```

### Container Registry 활성화

```bash
sudo nano /etc/gitlab/gitlab.rb
```

아래 내용 추가/수정:

```ruby
registry_external_url 'http://192.168.10.248:5050'
gitlab_rails['registry_enabled'] = true
```

```bash
sudo gitlab-ctl reconfigure
sudo gitlab-ctl restart
```

### Docker 설치 (CI Runner용)

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER

# daemon.json 설정 (MTU 1400 필수)
sudo tee /etc/docker/daemon.json <<EOF
{
  "insecure-registries": ["192.168.10.248:5050"],
  "dns": ["8.8.8.8", "8.8.4.4"],
  "mtu": 1400,
  "iptables": true
}
EOF

sudo systemctl restart docker
```

### GitLab CI Runner 설치 및 등록

```bash
# Runner 설치
curl -L https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.deb.sh | sudo bash
sudo apt-get install -y gitlab-runner

# Runner 등록
sudo gitlab-runner register \
  --url http://192.168.10.248 \
  --token glrtr-YRGRC9XBdLU7DPsZhDBv \
  --executor docker \
  --docker-image docker:24-dind \
  --tag-list color-ai
```

### config.toml 수정 (pull_policy 설정)

```bash
sudo nano /etc/gitlab-runner/config.toml
```

```toml
[[runners]]
  executor = "docker"
  [runners.docker]
    image = "docker:24-dind"
    pull_policy = ["if-not-present"]   # ← 필수
    privileged = true
    volumes = ["/var/run/docker.sock:/var/run/docker.sock", "/cache"]
```

```bash
sudo gitlab-runner restart
```

---

## 설치 완료 확인 체크리스트

**VM1에서 실행:**

```bash
# 전체 노드 상태
kubectl get nodes
# 3개 노드 모두 Ready 확인

# 시스템 Pod 상태
kubectl get pods -A
# kube-flannel, coredns 등 Running 확인

# 환경변수 재설정 (세션마다 필요)
GITLAB_PAT="glpat-IOsw1AePR-n4faXI2Y0U_W86MQp1OjEH.01.0w0kofn14"
ARGOCD_PASSWORD="pjyQPIcGjmq9wlu-"
```

| 항목 | 확인 명령어 | 기대 결과 |
|------|------------|----------|
| 노드 상태 | `kubectl get nodes` | 3개 Ready |
| Flannel | `kubectl get pods -n kube-flannel` | Running |
| 고정 IP | `ip addr show enp0s8` | 각 VM IP 확인 |
| 외부 인터넷 | `curl -s https://google.com` | 응답 수신 |
| iptables | `sudo iptables -t nat -L POSTROUTING -n` | MASQUERADE 규칙 확인 |
| containerd | `sudo systemctl status containerd` | active (running) |

---

## 트러블슈팅 메모

| 증상 | 원인 | 해결 |
|------|------|------|
| 노드 STATUS: NotReady | Flannel CNI 미설치 또는 iface 미지정 | Step 6 재확인, `--iface=enp0s8` 추가 |
| Pod 외부 인터넷 불가 | iptables MASQUERADE 누락 | Step 10 재실행 |
| kubeadm join 토큰 만료 | 기본 TTL 24시간 | `kubeadm token create --print-join-command` 재발급 |
| containerd insecure registry 인증 실패 | hosts.toml 경로 오류 | `/etc/containerd/certs.d/192.168.10.248:5050/hosts.toml` 경로 재확인 |
| Netplan 적용 후 SSH 끊김 | metric 설정 오류로 기본 라우트 변경 | VirtualBox 콘솔 직접 접속 후 Netplan 재설정 |
