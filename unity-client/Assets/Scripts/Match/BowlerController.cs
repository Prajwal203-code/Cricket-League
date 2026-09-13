using System;
using System.Collections;
using UnityEngine;
using CricketStrike.Data;

namespace CricketStrike.Match
{
    public class BowlerController : MonoBehaviour
    {
        [Header("Animation & References")]
        [SerializeField] private Animator animator;
        [SerializeField] private Transform handReleasePoint;
        [SerializeField] private Transform startRunUpPosition;
        [SerializeField] private Transform deliveryPosition;

        [Header("Run-Up Settings")]
        [SerializeField] private float runUpDuration = 0.8f;

        private PlayerCardData _currentCard;
        private bool _isBowling;

        public event Action OnBallReleased;
        public event Action OnDeliveryComplete;

        public Transform ReleasePoint => handReleasePoint != null ? handReleasePoint : transform;

        public void Initialize(PlayerCardData bowlerCard)
        {
            _currentCard = bowlerCard;
        }

        public void StartDelivery(BallPhysics ball, float speedKmh, float swingInput, Vector2 pitchTargetNormalized, Vector3 pitchBaseTarget)
        {
            if (_isBowling) return;
            StartCoroutine(DeliveryRoutine(ball, speedKmh, swingInput, pitchTargetNormalized, pitchBaseTarget));
        }

        private IEnumerator DeliveryRoutine(BallPhysics ball, float speedKmh, float swingInput, Vector2 pitchTargetNormalized, Vector3 pitchBaseTarget)
        {
            _isBowling = true;

            if (animator != null)
            {
                animator.SetTrigger("Deliver");
            }

            // Animate run-up movement
            float elapsed = 0f;
            Vector3 startPos = startRunUpPosition != null ? startRunUpPosition.position : transform.position;
            Vector3 endPos = deliveryPosition != null ? deliveryPosition.position : transform.position + transform.forward * 4f;

            while (elapsed < runUpDuration)
            {
                elapsed += Time.deltaTime;
                float t = Mathf.Clamp01(elapsed / runUpDuration);
                transform.position = Vector3.Lerp(startPos, endPos, t);
                yield return null;
            }

            // Calculate exact pitch landing target based on line & length normalized inputs
            // Line (X: -1 to 1) spreads across 1.8 meters; Length (Y: -1 to 1) spreads 4 meters on pitch
            Vector3 targetSpot = pitchBaseTarget + new Vector3(pitchTargetNormalized.x * 0.9f, 0, pitchTargetNormalized.y * 2.0f);

            // Calculate bowler swing capability
            float baseSwing = _currentCard != null ? (_currentCard.CurrentPower / 40f) : 0.6f;
            float totalSwing = baseSwing * swingInput;

            // Deliver the ball
            Vector3 releasePos = handReleasePoint != null ? handReleasePoint.position : transform.position + Vector3.up * 1.8f;
            ball.DeliverBall(speedKmh, totalSwing, releasePos, targetSpot);

            OnBallReleased?.Invoke();

            yield return new WaitForSeconds(0.5f);
            _isBowling = false;
            OnDeliveryComplete?.Invoke();
        }

        public void ResetPosition()
        {
            _isBowling = false;
            if (startRunUpPosition != null)
            {
                transform.position = startRunUpPosition.position;
            }
            if (animator != null)
            {
                animator.Play("Idle", 0, 0f);
            }
        }
    }
}
