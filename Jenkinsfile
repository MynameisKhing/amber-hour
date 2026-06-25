// Amber Hour — CI/CD pipeline
//
// Trigger: a version tag matching V*.*.* is pushed (e.g. `git push origin V1.2.3`).
// Flow:    validate tag → build & push images (vet/test run inside the image build) → kubectl deploy
//
// Requirements (Jenkins runs as a pod inside the target cluster on Rancher):
//   - Docker CLI + daemon access (build/push images)
//   - kubectl on PATH; deploys via the pod's in-cluster ServiceAccount
//   - Plugins: Pipeline, Docker Pipeline, Credentials Binding
//   - Credentials:
//       * 'dockerhub-amber-credential' : Username/Password — push rights to
//                                        docker.io/psu6510110336 (use an access token)
//   - The Jenkins pod's ServiceAccount must hold RBAC to apply deployment/service/
//     ingress in the `khing` namespace (Role + RoleBinding).
//
// Deployment is direct: this pipeline runs `kubectl apply` on deployment/service/ingress.
// Cluster infra (Secret, ConfigMap, PVC, Redis) is provisioned manually and lives only
// in the cluster — the Secret with live credentials is never committed to git.

pipeline {
  agent any

  options {
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
    timeout(time: 30, unit: 'MINUTES')
  }

  environment {
    REGISTRY        = 'docker.io'
    IMAGE_REPO      = 'psu6510110336/amber-hour'   // single repo, component-tagged
    DOCKERHUB_CREDS = 'dockerhub-amber-credential'
    NAMESPACE       = 'khing'
    MANIFEST        = 'rancher-yaml/deployment.yml'
  }

  stages {
    stage('Checkout & validate version tag') {
      steps {
        checkout scm
        script {
          // The build is triggered by a pushed tag. Resolve it (TAG_NAME for Multibranch,
          // `git describe` for a plain Pipeline) and refuse anything that isn't V*.*.*.
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

    // No standalone test stage: backend `go vet`/`go test` run inside backend/Dockerfile
    // and frontend `tsc -b` runs via `npm run build` in frontend/Dockerfile. The image
    // build (streamed context) is the validation, so it works on Jenkins-in-Kubernetes
    // where bind-mounting the workspace into sibling containers is not possible.
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
        // Jenkins runs as a pod inside this cluster, so kubectl uses the pod's
        // in-cluster ServiceAccount and the internal API (https://kubernetes.default.svc).
        // The Rancher-downloaded kubeconfig pointed at an external proxy URL that the
        // pod's DNS can't resolve. The pod's SA must hold RBAC to deploy in `khing`.
        sh '''
          set -e

          # Point the deployment manifest at the freshly pushed image tags
          sed -i -E "s#(image: ${IMAGE_REPO}:)backend-[A-Za-z0-9._-]+#\\1${BACKEND_TAG}#g"  "$MANIFEST"
          sed -i -E "s#(image: ${IMAGE_REPO}:)frontend-[A-Za-z0-9._-]+#\\1${FRONTEND_TAG}#g" "$MANIFEST"

          # Apply the app manifests. Cluster-level infra (ConfigMap, Secret, PVC,
          # Redis, namespace) is one-time / stateful and is provisioned manually.
          kubectl apply -n "$NAMESPACE" \
            -f rancher-yaml/service.yml \
            -f rancher-yaml/ingress.yml \
            -f "$MANIFEST"

          kubectl rollout status -n "$NAMESPACE" deployment/amber-backend  --timeout=180s
          kubectl rollout status -n "$NAMESPACE" deployment/amber-frontend --timeout=180s
        '''
      }
    }
  }

  post {
    success { echo "✅ ${env.JOB_NAME} #${env.BUILD_NUMBER} — deployed ${env.VERSION} to ${env.NAMESPACE}." }
    failure { echo "❌ ${env.JOB_NAME} #${env.BUILD_NUMBER} failed. Check the stage logs." }
    always  { sh 'docker image prune -f >/dev/null 2>&1 || true' }
  }
}
