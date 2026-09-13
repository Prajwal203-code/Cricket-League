using TMPro;
using UnityEngine;
using CricketStrike.Match;
using CricketStrike.UI.Core;

namespace CricketStrike.UI.Screens
{
    public class BowlingHUDOverlay : UIScreen
    {
        [Header("Bowling Sub-Components")]
        [SerializeField] private DirectionCircle directionCircle;
        [SerializeField] private SpeedMeter speedMeter;
        [SerializeField] private TimingBar timingBar;
        [SerializeField] private TextMeshProUGUI bowlingStepHintText;

        public DirectionCircle DirectionCircle => directionCircle;
        public SpeedMeter SpeedMeter => speedMeter;
        public TimingBar TimingBar => timingBar;

        public override void OnShow(object data = null)
        {
            base.OnShow(data);
            SetStepGuide(1);
        }

        public void SetStepGuide(int step)
        {
            if (bowlingStepHintText == null) return;

            switch (step)
            {
                case 1:
                    bowlingStepHintText.text = "1. Drag circle to set Line & Length";
                    break;
                case 2:
                    bowlingStepHintText.text = "2. Tap to lock Speed";
                    break;
                case 3:
                    bowlingStepHintText.text = "3. Stop in PERFECT zone for maximum swing!";
                    break;
                default:
                    bowlingStepHintText.text = "Bowling...";
                    break;
            }
        }
    }
}
