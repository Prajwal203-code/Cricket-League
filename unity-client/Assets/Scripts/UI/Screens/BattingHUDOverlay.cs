using TMPro;
using UnityEngine;
using CricketStrike.Match;
using CricketStrike.UI.Core;

namespace CricketStrike.UI.Screens
{
    public class BattingHUDOverlay : UIScreen
    {
        [Header("Timing Engine Reference")]
        [SerializeField] private TimingBar timingBar;
        [SerializeField] private TextMeshProUGUI battingHintText;
        [SerializeField] private GameObject swipeGuideOverlay;

        public override void OnShow(object data = null)
        {
            base.OnShow(data);
            if (battingHintText != null)
            {
                battingHintText.text = "Watch the ball • TAP & SWIPE to Hit!";
            }
        }

        public void ShowTiming(float speedMultiplier)
        {
            if (timingBar != null)
            {
                timingBar.StartTiming(speedMultiplier);
            }
        }

        public void HideTiming()
        {
            if (timingBar != null)
            {
                timingBar.Hide();
            }
        }
    }
}
