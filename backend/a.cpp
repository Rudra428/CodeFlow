#include <bits/stdc++.h>
using namespace std;
#define int long long
#define yes cout << "YES" << '\n'
#define no cout << "NO" << '\n'
#define e cout << '\n'
#define fr(i, a, b) for (int i = (a); i < (int)(b); i++)
#define frr(i, a, b) for (int i = (a); i >= (int)(b); i--)
#define vi vector<int>
#define vvi vector<vi>
#define pi pair<int,int>
#define vpi vector<pair<int,int>>
#define all(a) a.begin(), a.end()

void ansi(int ans) { cout << ans << '\n'; }

void read(vi &a, int n) {
    for (int i = 0; i < n; i++) {
        cin >> a[i];
    }
}
template <typename T>
void show(vector<T> &a) {
    for (auto &x : a) {
        cout << x << " ";
    }
    cout << '\n';
}


map<int, int> frequency(vi a, int n) {
    map<int, int> freq;
    fr(i, 0, n) {
        freq[a[i]]++;
    }
    return freq;
}

int lcm(int a, int b) {
    return a * b / __gcd(a, b);
}



const int mod = 1e9 + 7;
int modexp(int a, int b) {
    int res = 1;
    a = a % mod;
    while (b > 0) {
        if (b & 1) {
            res = (1LL * res * a) % mod;
        }
        a = (1LL * a * a) % mod;
        b >>= 1;
    }
    return res;
}
void sieve(vi &prime, int n) {
    prime[0] = prime[1] = 0;
    for (int i = 2; i * i <= n; i++) {
        if (prime[i]) {
            for (int j = i * i; j <= n; j += i) {
                prime[j] = 0;
            }
        }
    }
}


void solve() {
    stack<int>s;
}

signed main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    int t = 1;
    cin >> t;
    while (t--) solve();
}