// Amber Hour — CI/CD pipeline
//
// Flow:  test → build & push images (Docker Hub) → kubectl deploy to namespace `khing`
//
// Requirements on the Jenkins controller/agent:
//   - Docker CLI + daemon access (build/push images, run tool containers)
//   - kubectl on PATH, agent able to reach the cluster API server
//   - Plugins: Pipeline, Docker Pipeline, Credentials Binding, Kubernetes CLI
//   - Credentials:
//       * 'dockerhub-creds'  : Username/Password — push rights to docker.io/psu6510110336
//                              (use a Docker Hub access token as the password)
//       * 'kubeconfig-khing' : Secret file — kubeconfig with RBAC to apply/patch
//                              deployments in the `khing` namespace
//
// Deployment is direct: this pipeline runs `kubectl apply`. The Secret holding live
// credentials is NOT in git — it is applied to the cluster manually (see
// rancher-yaml/secret.example.yml). The pipeline only applies the non-secret manifests.

pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
    timeout(time: 30, unit: 'MINUTES')
  }

  environment {
    REGISTRY        = 'docker.io'
    IMAGE_REPO      = 'psu6510110336/amber-hour'   // single repo, component-tagged
    DOCKERHUB_CREDS = 'dockerhub-creds'
    KUBE_CREDS      = 'kubeconfig-khing'
    NAMESPACE       = 'khing'
    MANIFEST        = 'rancher-yaml/deployment.yml'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
        script {
          env.GIT_SHA       = sh(script: 'git rev-parse --short=8 HEAD', returnStdout: true).trim()
          env.BACKEND_TAG   = "backend-${env.GIT_SHA}"
          env.FRONTEND_TAG  = "frontend-${env.GIT_SHA}"
          env.BACKEND_IMAGE = "${IMAGE_REPO}:${env.BACKEND_TAG}"
          env.FRONTEND_IMAGE= "${IMAGE_REPO}:${env.FRONTEND_TAG}"
          echo "Building ${env.BACKEND_IMAGE} and ${env.FRONTEND_IMAGE}"
        }
      }
    }

    stage('Test') {
      parallel {
        stage('Backend (go vet + test)') {
          steps {
            sh '''
              docker run --rm -v "$PWD/backend":/src -w /src golang:1.23-alpine sh -c '
                go vet ./... &&
                go test ./... -count=1
              '
            '''
          }
        }
        stage('Frontend (typecheck + build)') {
          steps {
            sh '''
              docker run --rm -v "$PWD/frontend":/app -w /app node:20-alpine sh -c '
                npm ci &&
                npm run build
              '
            '''
          }
        }
      }
    }

    stage('Build & Push images') {
      when { branch 'deploy' }
      steps {
        withCredentials([usernamePassword(
            credentialsId: env.DOCKERHUB_CREDS,
            usernameVariable: 'DOCKER_USER',
            passwordVariable: 'DOCKER_PASS')]) {
          sh '''
            echo "$DOCKER_PASS" | docker login "$REGISTRY" -u "$DOCKER_USER" --password-stdin

            # Backend
            docker build -t "$BACKEND_IMAGE" -t "$IMAGE_REPO:backend-latest" ./backend
            docker push "$BACKEND_IMAGE"
            docker push "$IMAGE_REPO:backend-latest"

            # Frontend
            docker build -t "$FRONTEND_IMAGE" -t "$IMAGE_REPO:frontend-latest" ./frontend
            docker push "$FRONTEND_IMAGE"
            docker push "$IMAGE_REPO:frontend-latest"

            docker logout "$REGISTRY"
          '''
        }
      }
    }

    stage('Deploy (kubectl)') {
      when { branch 'deploy' }
      steps {
        withKubeConfig([credentialsId: env.KUBE_CREDS]) {
          sh '''
            set -e

            # Point the deployment manifest at the freshly pushed image tags
            sed -i -E "s#(image: ${IMAGE_REPO}:)backend-[A-Za-z0-9._-]+#\\1${BACKEND_TAG}#g"  "$MANIFEST"
            sed -i -E "s#(image: ${IMAGE_REPO}:)frontend-[A-Za-z0-9._-]+#\\1${FRONTEND_TAG}#g" "$MANIFEST"

            # Apply non-secret manifests only. The Secret, db-init Job, Redis and PVC
            # are one-time / stateful and are applied manually outside the pipeline.
            kubectl apply -n "$NAMESPACE" \
              -f rancher-yaml/configmap.yml \
              -f rancher-yaml/service.yml \
              -f rancher-yaml/ingress-http.yml \
              -f "$MANIFEST"

            kubectl rollout status -n "$NAMESPACE" deployment/amber-backend  --timeout=180s
            kubectl rollout status -n "$NAMESPACE" deployment/amber-frontend --timeout=180s
          '''
        }
      }
    }
  }

  post {
    success { echo "✅ ${env.JOB_NAME} #${env.BUILD_NUMBER} — deployed ${env.GIT_SHA} to ${env.NAMESPACE}." }
    failure { echo "❌ ${env.JOB_NAME} #${env.BUILD_NUMBER} failed. Check the stage logs." }
    always  { sh 'docker image prune -f >/dev/null 2>&1 || true' }
  }
}
