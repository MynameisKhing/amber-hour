pipeline {
  agent any

  options {
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
    timeout(time: 30, unit: 'MINUTES')
  }

  environment {
    REGISTRY        = 'docker.io'
    IMAGE_REPO      = 'psu6510110336/amber-hour'
    DOCKERHUB_CREDS = 'dockerhub-amber-credential'
    NAMESPACE       = 'khing'
    GITHUB_REPO_URL = 'https://github.com/MynameisKhing/amber-hour.git'
  }

  stages {
    stage('Preflight: GitHub connectivity') {
      steps {
        sh '''
          set -e
          echo "Checking Jenkins → GitHub connectivity before running the pipeline..."

          # 1) Reach github.com itself
          if ! curl -fsS -o /dev/null --max-time 15 https://github.com; then
            echo "❌ Cannot reach https://github.com from this Jenkins agent."
            exit 1
          fi

          # 2) Reach the actual repo's git endpoint (HTTP 200 = reachable & public,
          #    401 = reachable but needs auth — both prove network connectivity)
          code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
                 "${GITHUB_REPO_URL%.git}.git/info/refs?service=git-upload-pack")
          echo "GitHub repo endpoint returned HTTP ${code}"
          case "$code" in
            200|301|302|401) echo "✅ GitHub is reachable. Proceeding with the pipeline." ;;
            *) echo "❌ Unexpected response (${code}) from ${GITHUB_REPO_URL}."; exit 1 ;;
          esac
        '''
      }
    }

    stage('Checkout & validate version tag') {
      steps {
        checkout scm
        script {
          def tag = (env.TAG_NAME ?: sh(
              script: 'git describe --exact-match --tags HEAD 2>/dev/null || true',
              returnStdout: true)).trim()
          if (!(tag ==~ /^V\d+\.\d+\.\d+$/)) {
            error("Refusing to build: '${tag}' is not a valid version tag. Expected V*.*.* (e.g. V1.2.3).")
          }
          env.VERSION       = tag
          env.BACKEND_TAG   = "backend-${tag}"
          env.FRONTEND_TAG  = "frontend-${tag}"
          env.BACKEND_IMAGE = "${IMAGE_REPO}:${env.BACKEND_TAG}"
          env.FRONTEND_IMAGE= "${IMAGE_REPO}:${env.FRONTEND_TAG}"
          echo "Version ${tag} → ${env.BACKEND_IMAGE}, ${env.FRONTEND_IMAGE}"
        }
      }
    }

    stage('Build & Push images') {
      steps {
        withCredentials([usernamePassword(
            credentialsId: env.DOCKERHUB_CREDS,
            usernameVariable: 'DOCKER_USER',
            passwordVariable: 'DOCKER_PASS')]) {
          sh '''
            echo "$DOCKER_PASS" | docker login "$REGISTRY" -u "$DOCKER_USER" --password-stdin

            # Backend
            docker build -t "$BACKEND_IMAGE" ./backend
            docker push "$BACKEND_IMAGE"

            # Frontend
            docker build -t "$FRONTEND_IMAGE" ./frontend
            docker push "$FRONTEND_IMAGE"

            docker logout "$REGISTRY"
          '''
        }
      }
    }

    stage('Deploy (kubectl)') {
      steps {
        withCredentials([file(credentialsId: 'kubeconfig-khing',
                              variable: 'KUBECONFIG_FILE')]) {
          sh '''
            set -e
            export KUBECONFIG="$KUBECONFIG_FILE"
            kubectl get nodes

            kubectl set image -n "$NAMESPACE" deployment/amber-backend  "*=$BACKEND_IMAGE"
            kubectl set image -n "$NAMESPACE" deployment/amber-frontend "*=$FRONTEND_IMAGE"

            kubectl rollout restart -n "$NAMESPACE" deployment/amber-backend
            kubectl rollout restart -n "$NAMESPACE" deployment/amber-frontend

            kubectl rollout status -n "$NAMESPACE" deployment/amber-backend  --timeout=180s
            kubectl rollout status -n "$NAMESPACE" deployment/amber-frontend --timeout=180s
          '''
        }
      }
    }
  }

  post {
    success { echo "✅ ${env.JOB_NAME} #${env.BUILD_NUMBER} — deployed ${env.VERSION} to ${env.NAMESPACE}." }
    failure { echo "❌ ${env.JOB_NAME} #${env.BUILD_NUMBER} failed. Check the stage logs." }
    always  { sh 'docker image prune -f >/dev/null 2>&1 || true' }
  }
}
