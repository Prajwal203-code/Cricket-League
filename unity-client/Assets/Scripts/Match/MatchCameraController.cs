using System.Collections;
using UnityEngine;

namespace CricketStrike.Match
{
    public class MatchCameraController : MonoBehaviour
    {
        [Header("Camera & Targets")]
        [SerializeField] private Camera targetCamera;
        [SerializeField] private Transform batsmanTarget;
        [SerializeField] private Transform bowlerTarget;
        [SerializeField] private Transform ballTarget;

        [Header("Camera Offsets")]
        [SerializeField] private Vector3 battingOffset = new Vector3(0, 1.2f, -2.5f);
        [SerializeField] private Vector3 bowlingOffset = new Vector3(0, 1.5f, -3.0f);
        [SerializeField] private float defaultFov = 55f;
        [SerializeField] private float celebrationFov = 60f;

        [Header("Celebration Orbit Config")]
        [SerializeField] private float orbitRadius = 8f;
        [SerializeField] private float orbitHeight = 2.0f;
        [SerializeField] private float orbitSpeed = 20f; // deg/sec

        [Header("Smoothing")]
        [SerializeField] private float positionSmoothTime = 0.2f;
        [SerializeField] private float rotationSmoothSpeed = 8f;

        private CameraMode _currentMode = CameraMode.Batting;
        private Vector3 _currentVelocity;
        private float _orbitAngle;
        private Coroutine _shakeCoroutine;

        private void Awake()
        {
            if (targetCamera == null) targetCamera = GetComponent<Camera>();
            if (targetCamera == null) targetCamera = Camera.main;
        }

        public void SetMode(CameraMode mode)
        {
            _currentMode = mode;
            if (targetCamera != null)
            {
                targetCamera.fieldOfView = (mode == CameraMode.Celebration) ? celebrationFov : defaultFov;
            }
        }

        private void LateUpdate()
        {
            if (targetCamera == null) return;

            switch (_currentMode)
            {
                case CameraMode.Batting:
                    UpdateBattingCamera();
                    break;
                case CameraMode.Bowling:
                    UpdateBowlingCamera();
                    break;
                case CameraMode.Replay:
                    UpdateReplayCamera();
                    break;
                case CameraMode.Celebration:
                    UpdateCelebrationOrbit();
                    break;
            }
        }

        private void UpdateBattingCamera()
        {
            if (batsmanTarget == null) return;

            Vector3 targetPos = batsmanTarget.position + batsmanTarget.TransformDirection(battingOffset);
            targetCamera.transform.position = Vector3.SmoothDamp(targetCamera.transform.position, targetPos, ref _currentVelocity, positionSmoothTime);

            Vector3 lookTarget = (bowlerTarget != null) ? bowlerTarget.position + Vector3.up * 1.5f : batsmanTarget.position + Vector3.forward * 10f;
            Quaternion desiredRot = Quaternion.LookRotation(lookTarget - targetCamera.transform.position);
            targetCamera.transform.rotation = Quaternion.Slerp(targetCamera.transform.rotation, desiredRot, Time.deltaTime * rotationSmoothSpeed);
        }

        private void UpdateBowlingCamera()
        {
            if (bowlerTarget == null) return;

            Vector3 targetPos = bowlerTarget.position + bowlerTarget.TransformDirection(bowlingOffset);
            targetCamera.transform.position = Vector3.SmoothDamp(targetCamera.transform.position, targetPos, ref _currentVelocity, positionSmoothTime);

            Vector3 lookTarget = (batsmanTarget != null) ? batsmanTarget.position + Vector3.up * 1.0f : bowlerTarget.position + Vector3.forward * 18f;
            Quaternion desiredRot = Quaternion.LookRotation(lookTarget - targetCamera.transform.position);
            targetCamera.transform.rotation = Quaternion.Slerp(targetCamera.transform.rotation, desiredRot, Time.deltaTime * rotationSmoothSpeed);
        }

        private void UpdateReplayCamera()
        {
            if (ballTarget == null) return;

            Vector3 targetPos = ballTarget.position - ballTarget.forward * 4f + Vector3.up * 2f;
            targetCamera.transform.position = Vector3.SmoothDamp(targetCamera.transform.position, targetPos, ref _currentVelocity, 0.1f);

            Quaternion desiredRot = Quaternion.LookRotation(ballTarget.position - targetCamera.transform.position);
            targetCamera.transform.rotation = Quaternion.Slerp(targetCamera.transform.rotation, desiredRot, Time.deltaTime * 10f);
        }

        private void UpdateCelebrationOrbit()
        {
            Transform center = batsmanTarget != null ? batsmanTarget : transform;

            _orbitAngle += orbitSpeed * Time.deltaTime;
            float rad = _orbitAngle * Mathf.Deg2Rad;

            Vector3 offset = new Vector3(Mathf.Sin(rad) * orbitRadius, orbitHeight, Mathf.Cos(rad) * orbitRadius);
            targetCamera.transform.position = center.position + offset;

            targetCamera.transform.LookAt(center.position + Vector3.up * 1.2f);
        }

        public void TriggerShake(float duration = 0.3f, float magnitude = 0.15f)
        {
            if (_shakeCoroutine != null) StopCoroutine(_shakeCoroutine);
            _shakeCoroutine = StartCoroutine(ShakeRoutine(duration, magnitude));
        }

        private IEnumerator ShakeRoutine(float duration, float magnitude)
        {
            float elapsed = 0f;
            while (elapsed < duration)
            {
                elapsed += Time.deltaTime;
                Vector3 randomOffset = UnityEngine.Random.insideUnitSphere * magnitude;
                targetCamera.transform.position += randomOffset;
                yield return null;
            }
        }
    }
}
