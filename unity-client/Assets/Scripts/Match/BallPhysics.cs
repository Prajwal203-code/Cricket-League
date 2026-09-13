using System;
using UnityEngine;

namespace CricketStrike.Match
{
    [RequireComponent(typeof(Rigidbody), typeof(SphereCollider))]
    public class BallPhysics : MonoBehaviour
    {
        [Header("Physics Config")]
        [SerializeField] private Rigidbody rb;
        [SerializeField] private TrailRenderer seamTrail;
        [SerializeField] private Renderer ballRenderer;
        [SerializeField] private PhysicMaterial pitchPhysicMaterial;

        [Header("Bounce & Surface Settings")]
        [SerializeField] private float bounciness = 0.65f;
        [SerializeField] private float pitchFriction = 0.4f;

        private Vector3 _initialSwingForce;
        private bool _isDelivered;
        private bool _hasBounced;

        public event Action OnPitchBounce;
        public event Action<Collision> OnBallHitWicket;
        public event Action<Collision> OnBallHitBat;

        public bool IsInPlay => _isDelivered;
        public Vector3 CurrentVelocity => rb != null ? rb.linearVelocity : Vector3.zero;

        private void Awake()
        {
            if (rb == null) rb = GetComponent<Rigidbody>();
            if (seamTrail == null) seamTrail = GetComponentInChildren<TrailRenderer>();
            if (ballRenderer == null) ballRenderer = GetComponent<Renderer>();
        }

        public void SetBallSkin(Color skinColor)
        {
            if (ballRenderer != null)
            {
                ballRenderer.material.color = skinColor;
            }
            if (seamTrail != null)
            {
                seamTrail.startColor = skinColor;
                seamTrail.endColor = new Color(skinColor.r, skinColor.g, skinColor.b, 0f);
            }
        }

        public void DeliverBall(float speedKmh, float swing, Vector3 releasePoint, Vector3 pitchTargetPoint)
        {
            transform.position = releasePoint;
            rb.isKinematic = false;
            rb.linearVelocity = Vector3.zero;
            rb.angularVelocity = Vector3.zero;

            float speedMs = speedKmh / 3.6f;
            Vector3 direction = (pitchTargetPoint - releasePoint).normalized;

            // Apply forward linear velocity
            rb.linearVelocity = direction * speedMs;

            // Lateral swing force applied per frame in FixedUpdate
            _initialSwingForce = transform.right * (swing * 4.5f);
            _isDelivered = true;
            _hasBounced = false;

            // Spin rotation (topspin/backspin & lateral drift)
            rb.angularVelocity = new Vector3(15f, 0f, swing * 20f);

            if (seamTrail != null)
            {
                seamTrail.Clear();
                seamTrail.emitting = true;
            }
        }

        private void FixedUpdate()
        {
            if (_isDelivered && !rb.isKinematic && !_hasBounced)
            {
                // Air swing decay before pitch bounce
                rb.AddForce(_initialSwingForce, ForceMode.Acceleration);
            }
        }

        private void OnCollisionEnter(Collision collision)
        {
            if (collision.gameObject.CompareTag("Pitch") || collision.gameObject.name.Contains("Pitch"))
            {
                _hasBounced = true;
                _initialSwingForce *= 0.3f; // Swing force dampens sharply after bounce
                OnPitchBounce?.Invoke();
            }
            else if (collision.gameObject.CompareTag("Bat") || collision.gameObject.name.Contains("Bat"))
            {
                OnBallHitBat?.Invoke(collision);
            }
            else if (collision.gameObject.CompareTag("Wicket") || collision.gameObject.name.Contains("Stump") || collision.gameObject.name.Contains("Bail"))
            {
                OnBallHitWicket?.Invoke(collision);
            }
        }

        public void HitByBat(Vector3 shotVelocity, Vector3 angularSpin)
        {
            _isDelivered = false;
            _initialSwingForce = Vector3.zero;
            rb.linearVelocity = shotVelocity;
            rb.angularVelocity = angularSpin;
        }

        public void ResetBall(Vector3 defaultPosition)
        {
            _isDelivered = false;
            _hasBounced = false;
            _initialSwingForce = Vector3.zero;
            rb.linearVelocity = Vector3.zero;
            rb.angularVelocity = Vector3.zero;
            rb.isKinematic = true;
            transform.position = defaultPosition;

            if (seamTrail != null)
            {
                seamTrail.emitting = false;
                seamTrail.Clear();
            }
        }
    }
}
