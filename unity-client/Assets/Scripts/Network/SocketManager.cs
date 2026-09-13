using System;
using System.Collections;
using UnityEngine;

namespace CricketStrike.Network
{
    public class SocketManager : MonoBehaviour
    {
        public static SocketManager Instance { get; private set; }

        [Header("Server Connection")]
        [SerializeField] private string serverUrl = "http://127.0.0.1:3000";
        [SerializeField] private bool autoConnect = true;

        private bool _isConnected;
        private string _currentRoomId;

        // Callbacks
        public event Action OnConnected;
        public event Action OnDisconnected;
        public event Action<MatchFoundEvent> OnMatchFound;
        public event Action<BallResultEvent> OnBallResultReceived;
        public event Action<MatchEndEvent> OnMatchEndReceived;
        public event Action<float> OnOpponentDisconnected; // remaining seconds

        public bool IsConnected => _isConnected;

        private void Awake()
        {
            if (Instance == null) Instance = this;
            else Destroy(gameObject);
        }

        private void Start()
        {
            if (autoConnect)
            {
                Connect();
            }
        }

        public void Connect()
        {
            // Simulate / initiate Socket.IO connection
            StartCoroutine(ConnectRoutine());
        }

        private IEnumerator ConnectRoutine()
        {
            yield return new WaitForSeconds(0.5f);
            _isConnected = true;
            OnConnected?.Invoke();
        }

        public void RequestFindMatch(int tourId, long playerId, int playerLevel)
        {
            if (!_isConnected) return;

            var payload = new FindMatchRequest
            {
                tourId = tourId,
                playerId = playerId,
                playerLevel = playerLevel
            };

            // Emit 'find_match' event over WebSocket
            Debug.Log($"[Socket] Emit find_match for Tour {tourId}");
        }

        public void CancelFindMatch()
        {
            Debug.Log("[Socket] Emit cancel_match");
        }

        public void SendBowlAction(long matchId, float speedKmh, float timing, float line, float length)
        {
            var payload = new BowlActionPayload
            {
                matchId = matchId,
                speedKmh = speedKmh,
                timing = timing,
                line = line,
                length = length
            };

            Debug.Log($"[Socket] Emit bowl_action (Speed: {speedKmh:F1} km/h)");
        }

        public void SendBatAction(long matchId, float timing, string direction)
        {
            var payload = new BatActionPayload
            {
                matchId = matchId,
                timing = timing,
                direction = direction
            };

            Debug.Log($"[Socket] Emit bat_action (Dir: {direction})");
        }

        public void Disconnect()
        {
            _isConnected = false;
            OnDisconnected?.Invoke();
        }
    }
}
