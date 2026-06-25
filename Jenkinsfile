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
        // Jenkins runs as a pod in this cluster, so kubectl uses the pod's in-cluster
        // ServiceAccount + internal API; the SA holds RBAC to patch deployments in `khing`.
        //
        // The live Deployments were created by Rancher with a Rancher-managed
        // spec.selector (immutable), so `kubectl apply` of our manifest is rejected.
        // `kubectl set image` patches only the container image — it triggers a rolling
        // update without touching selectors/labels. "*=" targets every container in the
        // Deployment regardless of its container name.
        sh '''
          set -e
          kubectl set image -n "$NAMESPACE" deployment/amber-backend  "*=$BACKEND_IMAGE"
          kubectl set image -n "$NAMESPACE" deployment/amber-frontend "*=$FRONTEND_IMAGE"

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
