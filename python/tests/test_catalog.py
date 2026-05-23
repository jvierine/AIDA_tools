import math
import unittest

from aida_tools_py.catalog import _parse_yale_catalog_line, load_yale_bright_star_catalog


class YaleCatalogParsingTest(unittest.TestCase):
    def assertClose(self, actual, expected, places=12):
        self.assertTrue(
            math.isclose(actual, expected, rel_tol=0.0, abs_tol=10 ** -places),
            f"{actual!r} != {expected!r}",
        )

    def test_declination_sign_and_zero_degree_edges(self):
        cases = [
            ("5  32  0.4  -0  17  57  2.23  2000", -0.2991666666666667, "negative zero degrees"),
            ("5  32  0.4   0  17  57  2.23  2000", 0.2991666666666667, "positive zero degrees"),
            ("5  32  0.4  +0  17  57  2.23  2000", 0.2991666666666667, "explicit positive zero degrees"),
            ("5  32  0.4  -1  17  57  2.23  2000", -1.2991666666666666, "negative nonzero degrees"),
            ("5  32  0.4   1  17  57  2.23  2000", 1.2991666666666666, "positive nonzero degrees"),
            ("5  32  0.4  -89  59  59  2.23  2000", -89.99972222222222, "near south pole"),
            ("5  32  0.4   89  59  59  2.23  2000", 89.99972222222222, "near north pole"),
        ]
        for line, expected_dec, label in cases:
            with self.subTest(label=label):
                star = _parse_yale_catalog_line(line, "test")
                self.assertIsNotNone(star)
                self.assertClose(star.dec_deg, expected_dec)
                self.assertClose(star.ra_hours, 5 + 32 / 60 + 0.4 / 3600)
                self.assertClose(star.magnitude, 2.23)

    def test_whitespace_and_missing_fields(self):
        star = _parse_yale_catalog_line("\t5\t32\t0.4\t-0\t17\t57\t2.23\t2000\t", "tabbed")
        self.assertIsNotNone(star)
        self.assertEqual(star.name, "tabbed")
        self.assertClose(star.dec_deg, -0.2991666666666667)
        self.assertIsNone(_parse_yale_catalog_line("5 32 0.4 -0 17 57 2.23"))

    def test_bundled_catalog_mintaka_regression(self):
        mintaka = next(star for star in load_yale_bright_star_catalog() if star.name == "Mintaka")
        self.assertClose(mintaka.ra_hours, 5.533444444444444)
        self.assertClose(mintaka.dec_deg, -0.29916666666666664)


if __name__ == "__main__":
    unittest.main()
