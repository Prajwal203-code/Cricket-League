using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using CricketStrike.Data;

namespace CricketStrike.UI.Core
{
    public class HUDController : MonoBehaviour
    {
        [Header("Player 1 (Local) UI")]
        [SerializeField] private TextMeshProUGUI p1NameText;
        [SerializeField] private TextMeshProUGUI p1ScoreText;
        [SerializeField] private Image p1AvatarImg;

        [Header("Player 2 (Opponent) UI")]
        [SerializeField] private TextMeshProUGUI p2NameText;
        [SerializeField] private TextMeshProUGUI p2ScoreText;
        [SerializeField] private Image p2AvatarImg;

        [Header("Match Status & Target")]
        [SerializeField] private TextMeshProUGUI targetScoreText;
        [SerializeField] private TextMeshProUGUI matchStatusBanner;
        [SerializeField] private GameObject targetContainer;

        [Header("Active Cards Info")]
        [SerializeField] private TextMeshProUGUI batsmanInfoText;
        [SerializeField] private TextMeshProUGUI bowlerInfoText;

        [Header("6-Ball Circles")]
        [SerializeField] private List<ScoreCircle> scoreCircles = new List<ScoreCircle>();

        public void InitializeHUD(string p1Name, string p2Name, PlayerCardData batsmanCard, PlayerCardData bowlerCard)
        {
            if (p1NameText != null) p1NameText.text = p1Name;
            if (p2NameText != null) p2NameText.text = p2Name;

            if (p1ScoreText != null) p1ScoreText.text = "0";
            if (p2ScoreText != null) p2ScoreText.text = "0";

            if (targetContainer != null) targetContainer.SetActive(false);
            if (matchStatusBanner != null) matchStatusBanner.text = "1st INNINGS";

            UpdateActiveCards(batsmanCard, bowlerCard);
            ResetOverCircles();
        }

        public void UpdateActiveCards(PlayerCardData batsmanCard, PlayerCardData bowlerCard)
        {
            if (batsmanInfoText != null && batsmanCard != null)
            {
                batsmanInfoText.text = $"{batsmanCard.cardName} (Lv.{batsmanCard.currentLevel})";
            }
            if (bowlerInfoText != null && bowlerCard != null)
            {
                bowlerInfoText.text = $"{bowlerCard.cardName} #{bowlerCard.basePower}";
            }
        }

        public void ResetOverCircles()
        {
            foreach (var circle in scoreCircles)
            {
                if (circle != null) circle.ResetCircle();
            }
        }

        public void RecordBallResult(int ballNumber, int runs, int p1Total, int p2Total)
        {
            int index = ballNumber - 1;
            if (index >= 0 && index < scoreCircles.Count)
            {
                scoreCircles[index].SetResult(runs);
            }

            if (p1ScoreText != null) p1ScoreText.text = p1Total.ToString();
            if (p2ScoreText != null) p2ScoreText.text = p2Total.ToString();
        }

        public void ShowInningsBreak(int target)
        {
            if (targetContainer != null) targetContainer.SetActive(true);
            if (targetScoreText != null) targetScoreText.text = $"TARGET: {target}";
            if (matchStatusBanner != null) matchStatusBanner.text = $"NEEDS {target} RUNS TO WIN";
            ResetOverCircles();
        }
    }
}
