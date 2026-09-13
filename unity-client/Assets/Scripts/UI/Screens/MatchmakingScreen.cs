using System.Collections;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using CricketStrike.Data;
using CricketStrike.UI.Components;
using CricketStrike.UI.Core;

namespace CricketStrike.UI.Screens
{
    public class MatchmakingScreen : UIScreen
    {
        [Header("Header")]
        [SerializeField] private Button backButton;
        [SerializeField] private CoinDisplayBadge coinBadge;
        [SerializeField] private CoinDisplayBadge gemBadge;

        [Header("Tour Carousel View")]
        [SerializeField] private GameObject tourSelectionPanel;
        [SerializeField] private Transform tourCardContainer;
        [SerializeField] private TourCardView tourCardPrefab;

        [Header("Matchmaking Search View")]
        [SerializeField] private GameObject matchmakingPanel;
        [SerializeField] private TextMeshProUGUI tourNameTitle;
        [SerializeField] private TextMeshProUGUI tourNumberText;
        [SerializeField] private TextMeshProUGUI localPlayerName;
        [SerializeField] private TextMeshProUGUI localPlayerRank;
        [SerializeField] private TextMeshProUGUI opponentStatusText;
        [SerializeField] private RectTransform pulseRing;
        [SerializeField] private Button cancelSearchBtn;

        private TourData _selectedTour;
        private Coroutine _searchCoroutine;

        protected override void Awake()
        {
            base.Awake();

            if (backButton != null) backButton.onClick.AddListener(OnBackClicked);
            if (cancelSearchBtn != null) cancelSearchBtn.onClick.AddListener(CancelSearch);
        }

        public override void OnShow(object data = null)
        {
            base.OnShow(data);
            PopulateTourCarousel();
            ShowTourSelection();
        }

        private void PopulateTourCarousel()
        {
            if (tourCardContainer == null) return;

            // Clear old views
            foreach (Transform child in tourCardContainer)
            {
                Destroy(child.gameObject);
            }

            var tours = TourData.GetDefaultTours();
            foreach (var tour in tours)
            {
                if (tourCardPrefab != null)
                {
                    var cardObj = Instantiate(tourCardPrefab, tourCardContainer);
                    cardObj.Bind(tour);
                    cardObj.OnTourSelected += StartMatchmaking;
                }
            }
        }

        public void StartMatchmaking(TourData tour)
        {
            _selectedTour = tour;
            if (tourSelectionPanel != null) tourSelectionPanel.SetActive(false);
            if (matchmakingPanel != null) matchmakingPanel.SetActive(true);

            if (tourNameTitle != null) tourNameTitle.text = tour.tourName.ToUpper();
            if (tourNumberText != null) tourNumberText.text = $"TOUR {tour.tourNumber}";
            if (localPlayerName != null) localPlayerName.text = "Prajwal 🇮🇳";
            if (localPlayerRank != null) localPlayerRank.text = "⭐ 30";
            if (opponentStatusText != null) opponentStatusText.text = "Searching for opponents...";

            if (_searchCoroutine != null) StopCoroutine(_searchCoroutine);
            _searchCoroutine = StartCoroutine(SearchOpponentRoutine());
        }

        private IEnumerator SearchOpponentRoutine()
        {
            float elapsed = 0f;
            float searchTime = 2.8f;

            while (elapsed < searchTime)
            {
                elapsed += Time.deltaTime;
                if (pulseRing != null)
                {
                    float scale = 1f + 0.3f * Mathf.Sin(elapsed * 6f);
                    pulseRing.localScale = new Vector3(scale, scale, 1f);
                }
                yield return null;
            }

            if (opponentStatusText != null) opponentStatusText.text = "MATCH FOUND!";
            yield return new WaitForSeconds(0.8f);

            // Transition to Pre-Match
            UIManager.Instance.Push(ScreenType.PreMatch, _selectedTour);
        }

        public void CancelSearch()
        {
            if (_searchCoroutine != null) StopCoroutine(_searchCoroutine);
            ShowTourSelection();
        }

        private void ShowTourSelection()
        {
            if (tourSelectionPanel != null) tourSelectionPanel.SetActive(true);
            if (matchmakingPanel != null) matchmakingPanel.SetActive(false);
        }

        private void OnBackClicked()
        {
            if (matchmakingPanel != null && matchmakingPanel.activeSelf)
            {
                CancelSearch();
            }
            else
            {
                UIManager.Instance.Pop();
            }
        }
    }
}
