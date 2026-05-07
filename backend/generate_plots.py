import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import os
import sys

# -------------------------
# 1️⃣ Config: CSV & folders
# -------------------------
csv_file = sys.argv[1] if len(sys.argv) > 1 else "your_data.csv"
plots_folder = "../plots"
if not os.path.exists(plots_folder):
    os.makedirs(plots_folder)

# -------------------------
# 2️⃣ Load data
# -------------------------
df = pd.read_csv(csv_file)
numerical_cols = df.select_dtypes(include=['int64','float64']).columns.tolist()
categorical_cols = df.select_dtypes(include=['object','category']).columns.tolist()

# -------------------------
# 3️⃣ Dark theme settings
# -------------------------
plt.style.use('dark_background')
sns.set_theme(style="darkgrid")

# -------------------------
# 4️⃣ Categorical plots
# -------------------------
for col in categorical_cols:
    plt.figure(figsize=(6,4))
    counts = df[col].value_counts()
    unique_vals = counts.index.tolist()
    colors = ['green' if i==0 else 'red' if i==len(unique_vals)-1 else 'yellow' for i in range(len(unique_vals))]
    sns.barplot(x=counts.index, y=counts.values, palette=colors)
    plt.title(f"{col} Count", color='white')
    plt.xlabel(col, color='white')
    plt.ylabel("Count", color='white')
    plt.xticks(rotation=45, color='white')
    plt.yticks(color='white')
    plt.tight_layout()
    plt.savefig(f"{plots_folder}/{col}_cat_dark.png", facecolor='black', dpi=150)
    plt.close()

# -------------------------
# 5️⃣ Numerical plots
# -------------------------
for col in numerical_cols:
    plt.figure(figsize=(6,4))
    sns.histplot(df[col], kde=True, color='red', bins=10)
    plt.title(f"{col} Distribution", color='white')
    plt.xlabel(col, color='white')
    plt.ylabel("Frequency", color='white')
    plt.xticks(color='white')
    plt.yticks(color='white')
    plt.tight_layout()
    plt.savefig(f"{plots_folder}/{col}_num_dark.png", facecolor='black', dpi=150)
    plt.close()

# -------------------------
# 6️⃣ Correlation heatmap
# -------------------------
if len(numerical_cols) > 1:
    plt.figure(figsize=(8,6))
    corr = df[numerical_cols].corr()
    sns.heatmap(corr, annot=True, cmap='coolwarm', linewidths=0.5)
    plt.title("Correlation Matrix", color='white')
    plt.tight_layout()
    plt.savefig(f"{plots_folder}/correlation_dark.png", facecolor='black', dpi=150)
    plt.close()

print(f"✅ All plots generated in '{plots_folder}'!")
