using System;
using UnityEngine;

namespace CricketStrike.Data
{
    [Serializable]
    public class BallSkinData
    {
        public int id;
        public string skinName;
        public CardRarity rarity;
        public int quantity; // 0 = not owned / locked, -1 = infinite (default)
        public bool isEquipped;
        public string iconPath;
        public Color ballColor;

        public static BallSkinData[] GetDefaultSkins()
        {
            return new BallSkinData[]
            {
                new BallSkinData { id = 1, skinName = "Default", rarity = CardRarity.Common, quantity = -1, isEquipped = true, ballColor = new Color32(0xD9, 0x2B, 0x2B, 0xFF) },
                new BallSkinData { id = 2, skinName = "Kingfisher", rarity = CardRarity.Rare, quantity = 48, isEquipped = false, ballColor = new Color32(0xF1, 0xC4, 0x0F, 0xFF) },
                new BallSkinData { id = 3, skinName = "Stallion", rarity = CardRarity.Rare, quantity = 38, isEquipped = false, ballColor = new Color32(0xE6, 0x7E, 0x22, 0xFF) },
                new BallSkinData { id = 4, skinName = "Lizard", rarity = CardRarity.Rare, quantity = 30, isEquipped = false, ballColor = new Color32(0x9B, 0x59, 0xB6, 0xFF) },
                new BallSkinData { id = 5, skinName = "Lion", rarity = CardRarity.Epic, quantity = 6, isEquipped = false, ballColor = new Color32(0xEC, 0xF0, 0xF1, 0xFF) },
                new BallSkinData { id = 6, skinName = "Highness", rarity = CardRarity.Epic, quantity = 0, isEquipped = false, ballColor = new Color32(0x8E, 0x44, 0xAD, 0xFF) },
                new BallSkinData { id = 7, skinName = "Tempest", rarity = CardRarity.Legendary, quantity = 0, isEquipped = false, ballColor = new Color32(0x2C, 0x3E, 0x50, 0xFF) },
                new BallSkinData { id = 8, skinName = "Cobra", rarity = CardRarity.Legendary, quantity = 0, isEquipped = false, ballColor = new Color32(0x27, 0xAE, 0x60, 0xFF) }
            };
        }
    }
}
