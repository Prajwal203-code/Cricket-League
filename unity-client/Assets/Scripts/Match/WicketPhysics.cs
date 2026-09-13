using System;
using System.Collections.Generic;
using UnityEngine;

namespace CricketStrike.Match
{
    public class WicketPhysics : MonoBehaviour
    {
        [System.Serializable]
        public class StumpElement
        {
            public Transform transform;
            public Rigidbody rb;
            [HideInInspector] public Vector3 initialLocalPos;
            [HideInInspector] public Quaternion initialLocalRot;
        }

        [Header("Stumps & Bails")]
        [SerializeField] private StumpElement offStump;
        [SerializeField] private StumpElement middleStump;
        [SerializeField] private StumpElement legStump;
        [SerializeField] private StumpElement offBail;
        [SerializeField] private StumpElement legBail;

        [Header("Fracture Impulse Settings")]
        [SerializeField] private float stumpHitImpulse = 18f;
        [SerializeField] private float bailUpwardImpulse = 12f;
        [SerializeField] private float explosionRadius = 1.2f;

        [Header("VFX & Audio")]
        [SerializeField] private ParticleSystem woodSplinterParticles;

        private readonly List<StumpElement> _allElements = new List<StumpElement>();
        private bool _isShattered;

        public event Action OnWicketShattered;

        private void Awake()
        {
            RegisterElement(offStump);
            RegisterElement(middleStump);
            RegisterElement(legStump);
            RegisterElement(offBail);
            RegisterElement(legBail);

            LockWickets();
        }

        private void RegisterElement(StumpElement elem)
        {
            if (elem != null && elem.transform != null)
            {
                if (elem.rb == null) elem.rb = elem.transform.GetComponent<Rigidbody>();
                elem.initialLocalPos = elem.transform.localPosition;
                elem.initialLocalRot = elem.transform.localRotation;
                _allElements.Add(elem);
            }
        }

        public void LockWickets()
        {
            _isShattered = false;
            foreach (var elem in _allElements)
            {
                if (elem.transform != null)
                {
                    elem.transform.localPosition = elem.initialLocalPos;
                    elem.transform.localRotation = elem.initialLocalRot;
                }
                if (elem.rb != null)
                {
                    elem.rb.linearVelocity = Vector3.zero;
                    elem.rb.angularVelocity = Vector3.zero;
                    elem.rb.isKinematic = true;
                }
            }
        }

        public void ShatterWickets(Vector3 hitPoint, Vector3 hitVelocity)
        {
            if (_isShattered) return;
            _isShattered = true;

            // Enable physics on all stumps and bails
            foreach (var elem in _allElements)
            {
                if (elem.rb != null)
                {
                    elem.rb.isKinematic = false;
                }
            }

            // Apply directional force to stumps
            Vector3 forceDir = hitVelocity.normalized;
            if (forceDir == Vector3.zero) forceDir = Vector3.forward;

            if (middleStump?.rb != null)
            {
                middleStump.rb.AddForceAtPosition(forceDir * stumpHitImpulse, hitPoint, ForceMode.Impulse);
                middleStump.rb.AddTorque(UnityEngine.Random.insideUnitSphere * 15f, ForceMode.Impulse);
            }

            if (offStump?.rb != null)
            {
                offStump.rb.AddForceAtPosition((forceDir + Vector3.right * 0.3f) * (stumpHitImpulse * 0.85f), hitPoint, ForceMode.Impulse);
                offStump.rb.AddTorque(UnityEngine.Random.insideUnitSphere * 12f, ForceMode.Impulse);
            }

            if (legStump?.rb != null)
            {
                legStump.rb.AddForceAtPosition((forceDir - Vector3.right * 0.3f) * (stumpHitImpulse * 0.85f), hitPoint, ForceMode.Impulse);
                legStump.rb.AddTorque(UnityEngine.Random.insideUnitSphere * 12f, ForceMode.Impulse);
            }

            // Pop bails flying into the air with angular spin
            if (offBail?.rb != null)
            {
                Vector3 bailForce = (Vector3.up * 1.2f + Vector3.right * 0.5f + forceDir * 0.5f).normalized * bailUpwardImpulse;
                offBail.rb.AddForce(bailForce, ForceMode.Impulse);
                offBail.rb.AddTorque(new Vector3(25f, 15f, 30f), ForceMode.Impulse);
            }

            if (legBail?.rb != null)
            {
                Vector3 bailForce = (Vector3.up * 1.2f - Vector3.right * 0.5f + forceDir * 0.5f).normalized * bailUpwardImpulse;
                legBail.rb.AddForce(bailForce, ForceMode.Impulse);
                legBail.rb.AddTorque(new Vector3(-25f, 15f, -30f), ForceMode.Impulse);
            }

            if (woodSplinterParticles != null)
            {
                woodSplinterParticles.transform.position = hitPoint;
                woodSplinterParticles.Play();
            }

            OnWicketShattered?.Invoke();
        }

        private void OnCollisionEnter(Collision collision)
        {
            if (collision.gameObject.CompareTag("Ball") || collision.gameObject.name.Contains("Ball"))
            {
                var ballRb = collision.gameObject.GetComponent<Rigidbody>();
                Vector3 vel = ballRb != null ? ballRb.linearVelocity : (Vector3.forward * 20f);
                ShatterWickets(collision.contacts[0].point, vel);
            }
        }
    }
}
