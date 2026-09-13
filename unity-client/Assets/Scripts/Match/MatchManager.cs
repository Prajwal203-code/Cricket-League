using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using CricketStrike.Data;
using CricketStrike.UI.Core;

namespace CricketStrike.Match
{
    public class MatchManager : MonoBehaviour
    {
        public static MatchManager Instance { get; private set; }

        [Header("Match Config")]
        [SerializeField] private TourData activeTour;
        [SerializeField] private bool isLocalAiMatch = true;

        [Header("Scene Actors & Systems")]
        [SerializeField] private BatsmanController batsman;
        [SerializeField] private BowlerController bowler;
        [SerializeField] private BallPhysics cricketBall;
        [SerializeField] private WicketPhysics wickets;
        [SerializeField] private MatchCameraController matchCamera;
        [SerializeField] private Transform pitchBasePoint;
        [SerializeField] private Transform ballResetPosition;

        [Header("UI Overlays")]
        [SerializeField] private TimingBar timingBar;
        [SerializeField] private SpeedMeter speedMeter;
        [SerializeField] private DirectionCircle directionCircle;
        [SerializeField] private HUDController hudController;

        // Runtime Match State
        private MatchState _currentState = MatchState.Connecting;
        private int _currentInnings = 1; // 1 or 2
        private int _currentBall = 1;    // 1 to 6
        private int _p1Score = 0;
        private int _p2Score = 0;
        private int _targetScore = 0;
        private bool _p1BatsFirst = true;
        private readonly List<int> _p1Balls = new List<int>();
        private readonly List<int> _p2Balls = new List<int>();

        // Player & Opponent Card Data
        private UserPlayerData _localUser;
        private PlayerCardData _p1BatCard;
        private PlayerCardData _p1BowlCard;
        private PlayerCardData _p2BatCard;
        private PlayerCardData _p2BowlCard;

        // Events
        public event Action<MatchState> OnStateChanged;
        public event Action<int, int, int> OnScoreUpdated; // (p1Score, p2Score, currentBall)
        public event Action<int, bool, TimingResult, ShotDirection> OnBallCompleted; // (runs, isWicket, timing, direction)
        public event Action<bool, int, int> OnMatchFinished; // (isLocalPlayerWinner, p1Score, p2Score)

        public MatchState CurrentState => _currentState;
        public int CurrentInnings => _currentInnings;
        public int CurrentBall => _currentBall;
        public int P1Score => _p1Score;
        public int P2Score => _p2Score;
        public int TargetScore => _targetScore;

        private void Awake()
        {
            if (Instance == null) Instance = this;
            else Destroy(gameObject);
        }

        private void Start()
        {
            InitializeMatch(UserPlayerData.CreateDefaultProfile(), TourData.GetDefaultTours()[2]); // Adelaide Default
        }

        public void InitializeMatch(UserPlayerData user, TourData tour)
        {
            _localUser = user;
            activeTour = tour;

            _p1BatCard = user.activeBatsman;
            _p1BowlCard = user.activeBowlers.Count > 0 ? user.activeBowlers[0] : null;

            // Mock opponent cards for AI/remote matching
            _p2BatCard = new PlayerCardData { cardName = "Ranveer", role = PlayerRole.Batsman, rarity = CardRarity.Epic, basePower = 30, currentLevel = 4 };
            _p2BowlCard = new PlayerCardData { cardName = "Brad", role = PlayerRole.FastBowler, rarity = CardRarity.Epic, basePower = 28, currentLevel = 4 };

            // Bind Sub-system Callbacks
            if (cricketBall != null)
            {
                cricketBall.OnBallHitWicket += HandleBallHitWicket;
            }

            ChangeState(MatchState.PreMatch);
        }

        public void ChangeState(MatchState newState)
        {
            _currentState = newState;
            OnStateChanged?.Invoke(_currentState);

            switch (_currentState)
            {
                case MatchState.PreMatch:
                    StartCoroutine(PreMatchSequence());
                    break;
                case MatchState.Toss:
                    ResolveToss();
                    break;
                case MatchState.BattingP1:
                case MatchState.BattingP2:
                    SetupBattingTurn();
                    break;
                case MatchState.BowlingP1:
                case MatchState.BowlingP2:
                    SetupBowlingTurn();
                    break;
                case MatchState.InningsBreak:
                    StartCoroutine(InningsBreakSequence());
                    break;
                case MatchState.Result:
                    EvaluateMatchResult();
                    break;
            }
        }

        private IEnumerator PreMatchSequence()
        {
            if (hudController != null)
            {
                hudController.InitializeHUD(_localUser.username, "Guest_434660", _p1BatCard, _p2BowlCard);
            }

            yield return new WaitForSeconds(3.0f); // Pre-match 3-2-1 countdown
            ChangeState(MatchState.Toss);
        }

        private void ResolveToss()
        {
            // Server or local RNG decides toss winner (50% local player bats first)
            _p1BatsFirst = UnityEngine.Random.value > 0.5f;

            if (_p1BatsFirst)
            {
                ChangeState(MatchState.BattingP1);
            }
            else
            {
                ChangeState(MatchState.BowlingP2);
            }
        }

        private void SetupBattingTurn()
        {
            if (matchCamera != null) matchCamera.SetMode(CameraMode.Batting);

            batsman.Initialize(_currentState == MatchState.BattingP1 ? _p1BatCard : _p2BatCard);
            bowler.Initialize(_currentState == MatchState.BattingP1 ? _p2BowlCard : _p1BowlCard);

            batsman.ResetToCrease();
            bowler.ResetPosition();
            wickets.LockWickets();
            cricketBall.ResetBall(ballResetPosition != null ? ballResetPosition.position : Vector3.zero);

            // Hide bowling overlays; start delivery sequence
            if (directionCircle != null) directionCircle.SetInteractive(false);
            if (speedMeter != null) speedMeter.Hide();

            StartCoroutine(BattingDeliverySequence());
        }

        private IEnumerator BattingDeliverySequence()
        {
            yield return new WaitForSeconds(1.0f);

            // Bowler AI or remote player chooses delivery stats
            float deliverySpeed = 110f + UnityEngine.Random.Range(-15f, 25f);
            float deliverySwing = UnityEngine.Random.Range(-0.8f, 0.8f);
            Vector2 targetSpot = new Vector2(UnityEngine.Random.Range(-0.6f, 0.6f), UnityEngine.Random.Range(-0.5f, 0.5f));

            Vector3 pitchBase = pitchBasePoint != null ? pitchBasePoint.position : Vector3.forward * 10f;
            bowler.StartDelivery(cricketBall, deliverySpeed, deliverySwing, targetSpot, pitchBase);

            // Wait until ball is released to trigger batsman timing bar and swipe input
            yield return new WaitForSeconds(0.7f);

            if (timingBar != null)
            {
                timingBar.StartTiming(deliverySpeed / 100f);
            }

            batsman.EnableBattingInput();
            batsman.OnShotTriggered += HandleBatsmanShot;
        }

        private void HandleBatsmanShot(ShotDirection direction)
        {
            batsman.OnShotTriggered -= HandleBatsmanShot;

            TimingResult timing = (timingBar != null) ? timingBar.StopTiming() : TimingResult.Good;
            int runs = batsman.CalculateRuns(timing, direction, cricketBall);

            StartCoroutine(ProcessBallOutcome(runs, timing, direction));
        }

        private void SetupBowlingTurn()
        {
            if (matchCamera != null) matchCamera.SetMode(CameraMode.Bowling);

            batsman.Initialize(_currentState == MatchState.BowlingP1 ? _p2BatCard : _p1BatCard);
            bowler.Initialize(_currentState == MatchState.BowlingP1 ? _p1BowlCard : _p2BowlCard);

            batsman.ResetToCrease();
            bowler.ResetPosition();
            wickets.LockWickets();
            cricketBall.ResetBall(ballResetPosition != null ? ballResetPosition.position : Vector3.zero);

            // Show interactive bowling controls
            if (directionCircle != null)
            {
                directionCircle.ResetPosition();
                directionCircle.SetInteractive(true);
            }

            if (speedMeter != null)
            {
                speedMeter.StartMeter(_p1BowlCard != null ? _p1BowlCard.CurrentPower : 25);
                speedMeter.OnSpeedLocked += HandleBowlingSpeedLocked;
            }
        }

        private void HandleBowlingSpeedLocked(float speedKmh, float multiplier)
        {
            if (speedMeter != null) speedMeter.OnSpeedLocked -= HandleBowlingSpeedLocked;

            if (timingBar != null)
            {
                timingBar.StartTiming(multiplier);
                timingBar.OnTimingStopped += (timing, pos) => ExecutePlayerBowl(speedKmh, timing);
            }
        }

        private void ExecutePlayerBowl(float speedKmh, TimingResult timing)
        {
            if (directionCircle != null) directionCircle.SetInteractive(false);
            if (timingBar != null) timingBar.Hide();

            float swing = (timing == TimingResult.Perfect) ? 0.8f : (timing == TimingResult.Good ? 0.4f : 0.1f);
            Vector2 targetNormalized = (directionCircle != null) ? directionCircle.NormalizedTarget : Vector2.zero;
            Vector3 pitchBase = pitchBasePoint != null ? pitchBasePoint.position : Vector3.forward * 10f;

            bowler.StartDelivery(cricketBall, speedKmh, swing, targetNormalized, pitchBase);

            // Opponent AI responds after delivery
            StartCoroutine(OpponentAiBatResponse());
        }

        private IEnumerator OpponentAiBatResponse()
        {
            yield return new WaitForSeconds(1.0f);

            // Simulate opponent timing & shot
            TimingResult oppTiming = (UnityEngine.Random.value > 0.4f) ? TimingResult.Good : (UnityEngine.Random.value > 0.5f ? TimingResult.Perfect : TimingResult.Early);
            ShotDirection oppDirection = (ShotDirection)UnityEngine.Random.Range(0, 4);

            batsman.TriggerShot(oppDirection);
            int runs = batsman.CalculateRuns(oppTiming, oppDirection, cricketBall);

            StartCoroutine(ProcessBallOutcome(runs, oppTiming, oppDirection));
        }

        private IEnumerator ProcessBallOutcome(int runs, TimingResult timing, ShotDirection direction)
        {
            bool isWicket = (runs < 0);
            int actualRuns = Mathf.Max(0, runs);

            if (isWicket)
            {
                batsman.PlayOutAnimation();
                if (matchCamera != null) matchCamera.TriggerShake(0.4f, 0.2f);
            }
            else if (runs == 6)
            {
                if (matchCamera != null)
                {
                    matchCamera.SetMode(CameraMode.Replay);
                    matchCamera.TriggerShake(0.25f, 0.1f);
                }
            }

            // Update scores
            bool isP1Batting = (_currentState == MatchState.BattingP1 || _currentState == MatchState.BowlingP2);
            if (isP1Batting)
            {
                _p1Score += actualRuns;
                _p1Balls.Add(runs);
            }
            else
            {
                _p2Score += actualRuns;
                _p2Balls.Add(runs);
            }

            if (hudController != null)
            {
                hudController.RecordBallResult(_currentBall, runs, _p1Score, _p2Score);
            }

            OnBallCompleted?.Invoke(actualRuns, isWicket, timing, direction);
            OnScoreUpdated?.Invoke(_p1Score, _p2Score, _currentBall);

            yield return new WaitForSeconds(2.0f);

            // Next ball or innings progression
            _currentBall++;
            if (_currentBall > GameConstants.BallsPerInnings)
            {
                if (_currentInnings == 1)
                {
                    ChangeState(MatchState.InningsBreak);
                }
                else
                {
                    ChangeState(MatchState.Result);
                }
            }
            else
            {
                // Check early win condition if chasing in 2nd innings
                if (_currentInnings == 2)
                {
                    int chasingScore = _p1BatsFirst ? _p2Score : _p1Score;
                    if (chasingScore > _targetScore)
                    {
                        ChangeState(MatchState.Result);
                        yield break;
                    }
                }

                // Repeat turn for next ball
                if (isP1Batting)
                {
                    SetupBattingTurn();
                }
                else
                {
                    SetupBowlingTurn();
                }
            }
        }

        private IEnumerator InningsBreakSequence()
        {
            _currentInnings = 2;
            _currentBall = 1;
            _targetScore = _p1BatsFirst ? _p1Score : _p2Score;

            if (hudController != null)
            {
                hudController.ShowInningsBreak(_targetScore + 1);
            }

            yield return new WaitForSeconds(3.5f);

            // Swap roles for Innings 2
            if (_p1BatsFirst)
            {
                ChangeState(MatchState.BowlingP1);
            }
            else
            {
                ChangeState(MatchState.BattingP2);
            }
        }

        private void EvaluateMatchResult()
        {
            bool isP1Winner;
            if (_p1Score > _p2Score) isP1Winner = true;
            else if (_p2Score > _p1Score) isP1Winner = false;
            else isP1Winner = !_p1BatsFirst; // Tie-breaker rule: 2nd innings player wins

            if (matchCamera != null)
            {
                matchCamera.SetMode(CameraMode.Celebration);
            }

            if (batsman != null)
            {
                batsman.PlayCelebration();
            }

            OnMatchFinished?.Invoke(isP1Winner, _p1Score, _p2Score);
        }

        private void HandleBallHitWicket(Collision collision)
        {
            if (wickets != null)
            {
                wickets.ShatterWickets(collision.contacts[0].point, collision.relativeVelocity);
            }
        }
    }
}
