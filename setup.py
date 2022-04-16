from setuptools import setup, find_packages


setup(
    name="fontra",
    use_scm_version={"write_to": "src/fontra/_version.py"},
    description="Fontra",
    # long_description=long_description,
    # long_description_content_type="text/markdown",
    author="Just van Rossum",
    author_email="justvanrossum@gmail.com",
    entry_points={
        "console_scripts": ["fontra=fontra.__main__:main"],
    },
    package_dir={"": "src"},
    packages=find_packages("src"),
    package_data={
        "": [
            "client/*.html",
            "client/*.ico",
            "client/*/*.html",
            "client/*/*.css",
            "client/*/*.svg",
            "client/*/*.js",
            "client/*/*.woff2",
        ]
    },
    install_requires=[
        "aiohttp>=3.8.1",
        "fonttools[ufo,unicode]>=4.17.0",
        "watchfiles>=0.10",
        "websockets>=10.1",
    ],
    setup_requires=["setuptools_scm"],
    extras_require={},
    python_requires=">=3.7",
    classifiers=[
        "Development Status :: 2 - Pre-Alpha",
        "Environment :: Console",
        "Environment :: Other Environment",
        "Intended Audience :: Developers",
        "Intended Audience :: End Users/Desktop",
        "License :: OSI Approved :: Apache Software License",
        "Natural Language :: English",
        "Operating System :: OS Independent",
        "Programming Language :: Python",
        "Programming Language :: Python :: 3",
        "Topic :: Multimedia :: Graphics",
    ],
)
