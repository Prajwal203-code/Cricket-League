using System;
using UnityEngine;
using CricketStrike.Data;

namespace CricketStrike.Match
{
    public class BatsmanController : MonoBehaviour
    {
        [Header("Animation & Model")]
        [SerializeField] private Animator animator;
        [SerializeField] private Transform batTransform;
        [SerializeField] private Transform batsmanCreasePoint;

        [Header("Input Config")]
        [SerializeField] private float swipeThreshold = 50f;
        [SerializeField] private float maxSwipeDuration = 0.35f;

        private Vector2 _touchStartPos;
        private float _touchStartTime;
        private bool _isAwaitingInput;
        private PlayerCardData _currentCard;

        public event Action<ShotDirection> OnShotTriggered;
        public event Action<int, TimingResult, ShotDirection> OnRunsEvaluated; // runs (-1 for wicket, 0-6), timing, direction

        public void Initialize(PlayerCardData batsmanCard)
        {
            _currentCard = batsmanCard;
        }

        public void EnableBattingInput()
        {
            _isAwaitingInput = true;
        }

        public void DisableBattingInput()
        {
            _isAwaitingInput = false;
        }

        private void Update()
        {
            if (!_isAwaitingInput) return;

#if UNITY_EDITOR || UNITY_STANDALONE
            HandleMouseInput();
#else
            HandleTouchInput();
#endif
        }

        private void HandleTouchInput()
        {
            if (Input.touchCount == 0) return;

            Touch touch = Input.GetTouch(0);
            if (touch.phase == TouchPhase.Began)
            {
                _touchStartPos = touch.position;
                _touchStartTime = Time.time;
            }
            else if (touch.phase == TouchPhase.Ended)
            {
                Vector2 delta = touch.position - _touchStartPos;
                float duration = Time.time - _touchStartTime;
                ShotDirection direction = ResolveShotDirection(delta, duration);
                TriggerShot(direction);
            }
        }

        private void HandleMouseInput()
        {
            if (Input.GetMouseButtonDown(0))
            {
                _touchStartPos = Input.mousePosition;
                _touchStartTime = Time.time;
            }
            else if (Input.GetMouseButtonUp(0))
            {
                Vector2 delta = (Vector2)Input.mousePosition - _touchStartPos;
                float duration = Time.time - _touchStartTime;
                ShotDirection direction = ResolveShotDirection(delta, duration);
                TriggerShot(direction);
            }
        }

        private ShotDirection ResolveShotDirection(Vector2 delta, float duration)
        {
            if (delta.magnitude < swipeThreshold || duration > maxSwipeDuration)
            {
                return ShotDirection.Defensive;
            }

            // Determine dominant swipe direction
            if (Mathf.Abs(delta.y) > Mathf.Abs(delta.x) && delta.y > 0)
            {
                return ShotDirection.Loft;
            }
            if (delta.x > 0)
            {
                return ShotDirection.Cover;
            }
            return ShotDirection.Leg;
        }

        public void TriggerShot(ShotDirection direction)
        {
            _isAwaitingInput = false;

            if (animator != null)
            {
                animator.SetTrigger(direction.ToString());
            }

            OnShotTriggered?.Invoke(direction);
        }

        public int CalculateRuns(TimingResult timing, ShotDirection direction, BallPhysics ball)
        {
            int basePower = _currentCard != null ? _currentCard.CurrentPower : 25;
            int runs = 0;

            switch (timing)
            {
                case TimingResult.Perfect:
                    if (direction == ShotDirection.Loft && basePower >= 28 && UnityEngine.Random.value < 0.75f)
                    {
                        runs = 6;
                    }
                    else if (direction == ShotDirection.Defensive)
                    {
                        runs = UnityEngine.Random.value < 0.6f ? 2 : 1;
                    }
                    else
                    {
                        runs = UnityEngine.Random.value < 0.65f ? 4 : 6;
                    }
                    break;

                case TimingResult.Good:
                    if (direction == ShotDirection.Loft)
                    {
                        runs = UnityEngine.Random.value < 0.5f ? 4 : 2;
                    }
                    else if (direction == ShotDirection.Defensive)
                    {
                        runs = 1;
                    }
                    else
                    {
                        runs = UnityEngine.Random.value < 0.5f ? 2 : 1;
                    }
                    break;

                case TimingResult.Early:
                case TimingResult.Late:
                    // 8% chance of mistimed edge / catch
                    if (UnityEngine.Random.value < 0.08f)
                    {
                        runs = -1; // Wicket!
                    }
                    else
                    {
                        runs = 0; // Dot ball
                    }
                    break;
            }

            // Apply exit physics to ball if present
            if (ball != null && runs >= 0)
            {
                ApplyHitPhysics(ball, runs, direction);
            }

            OnRunsEvaluated?.Invoke(runs, timing, direction);
            return runs;
        }

        private void ApplyHitPhysics(BallPhysics ball, int runs, ShotDirection direction)
        {
            Vector3 shotDir = Vector3.forward;
            float speed = 25f;

            switch (direction)
            {
                case ShotDirection.Loft:
                    shotDir = (Vector3.forward + Vector3.up * 0.8f).normalized;
                    speed = (runs == 6) ? 38f : 28f;
                    break;
                case ShotDirection.Cover:
                    shotDir = (Vector3.forward + Vector3.right * 0.9f + Vector3.up * 0.2f).normalized;
                    speed = (runs >= 4) ? 34f : 22f;
                    break;
                case ShotDirection.Leg:
                    shotDir = (Vector3.forward - Vector3.right * 0.9f + Vector3.up * 0.2f).normalized;
                    speed = (runs >= 4) ? 34f : 22f;
                    break;
                case ShotDirection.Straight:
                    shotDir = (Vector3.forward + Vector3.up * 0.15f).normalized;
                    speed = (runs >= 4) ? 32f : 20f;
                    break;
                case ShotDirection.Defensive:
                    shotDir = (Vector3.forward * 0.4f + Vector3.up * 0.05f).normalized;
                    speed = 8f;
                    break;
            }

            ball.HitByBat(shotDir * speed, new Vector3(-10f, 0, 0));
        }

        public void PlayCelebration()
        {
            if (animator != null) animator.SetTrigger("Celebrate");
        }

        public void PlayOutAnimation()
        {
            if (animator != null) animator.SetTrigger("Out");
        }

        public void ResetToCrease()
        {
            _isAwaitingInput = false;
            if (animator != null) animator.Play("Idle", 0, 0f);
        }
    }
}
